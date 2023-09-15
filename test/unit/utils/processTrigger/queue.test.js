const sinon = require("sinon");
const assert = require("assert");
const proxyquire = require("proxyquire");

const createFake = sinon.fake.resolves();
const removeFake = sinon.fake.resolves();
const ProcessTriggerQueue = proxyquire(
   "../../../../utils/processTrigger/queue.js",
   {
      "../../queries/pendingTrigger.js": {
         create: createFake,
         remove: removeFake,
         list: sinon.fake.resolves([
            {
               key: "mykey",
               data: '{"myData": true}',
               uuid: "123",
               user: '{"username": "admin"}',
            },
         ]),
      },
   }
);

const mockReq = {
   tenantID: "??",
   controller: {},
   log: () => {},
   _user: { username: "admin" },
};

const testQueueData = {
   124: {
      key: "newkey",
      data: { myData: true },
      requestID: "124",
      user: { username: "admin" },
   },
   123: {
      key: "mykey",
      data: { myData: true },
      requestID: "123",
      user: { username: "admin" },
   },
};

describe("ProcessTriggerQueue", () => {
   beforeEach(() => {});

   it("creates a new instance", () => {
      const queue = new ProcessTriggerQueue("tenant", () => {}, mockReq);
      assert.equal(queue.req.tenantID(), "tenant");
   });

   it(".init() loads data and calls retry", async () => {
      const clock = sinon.useFakeTimers();
      const queue = new ProcessTriggerQueue("tenant", () => {}, mockReq);
      const stubRetry = sinon.stub(queue, "retryQueued");
      await queue.init();
      await clock.tickAsync(60000);
      assert.equal(stubRetry.callCount, 2);
      assert.deepEqual(queue.Queue, { 123: testQueueData["123"] });
   });

   it(".add() trigger to Queue if not exist", async () => {
      const queue = new ProcessTriggerQueue("tenant", () => {}, mockReq);
      const jobData = {
         requestID: "124",
         key: "newkey",
         data: { myData: true },
      };

      await queue.add(mockReq, jobData);
      // Call again to test we don't add it twice
      await queue.add(mockReq, jobData);
      assert.equal(createFake.callCount, 1);
      assert.deepEqual(queue.Queue, { 124: testQueueData["124"] });
   });

   it(".removes() trigger from Queue", async () => {
      const queue = new ProcessTriggerQueue("tenant", () => {}, mockReq);
      queue.Queue = { 124: testQueueData["124"] };

      await queue.remove(mockReq, "124");
      // Removing what doesn't exist shouldn't cause problems
      await queue.remove(mockReq, "123");
      assert.equal(removeFake.callCount, 1);
      assert.deepEqual(queue.Queue, {});
   });

   it(".retryQueued() if successful removes from Queue", async () => {
      const requestorFake = sinon.fake.resolves();
      const queue = new ProcessTriggerQueue("tenant", requestorFake, mockReq);
      queue.Queue = testQueueData;
      const removeStub = sinon.stub(queue, "remove");
      await queue.retryQueued();

      assert.equal(requestorFake.callCount, 2);
      assert.equal(removeStub.callCount, 2);
   });

   it(".retryQueued() if unsuccessful doesn't remove from Queue", async () => {
      const requestorFake = sinon.fake.resolves("fallback");
      const queue = new ProcessTriggerQueue("tenant", requestorFake, mockReq);
      queue.Queue = testQueueData;
      const removeStub = sinon.stub(queue, "remove");
      await queue.retryQueued();

      assert.equal(requestorFake.callCount, 2);
      assert.equal(removeStub.callCount, 0);
   });
});
