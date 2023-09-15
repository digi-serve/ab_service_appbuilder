const sinon = require("sinon");
const assert = require("assert");
const proxyquire = require("proxyquire").noCallThru();

// Mock/Fake Dependecies
const getTenantsFake = sinon.fake.resolves([
   { uuid: "Tenant1" },
   { uuid: "Tenant2" },
]);

const circuitFakes = {
   constructor: sinon.fake(),
   fire: sinon.fake(),
   fallback: sinon.fake(),
};
const CircuitBreakerMock = class MockCircuitBreaker {
   constructor(...args) {
      circuitFakes.constructor(...args);
   }
   fire(...args) {
      circuitFakes.fire(...args);
   }
   fallback(...args) {
      circuitFakes.fallback(...args);
   }
   on() {}
};

const queueFakes = {
   constructor: sinon.fake(),
   init: sinon.fake(),
   add: sinon.fake(),
};
const QueueMock = class MockProcessTriggerQueue {
   constructor(...args) {
      queueFakes.constructor(...args);
   }
   init(...args) {
      queueFakes.init(...args);
   }
   add(...args) {
      queueFakes.add(...args);
   }
};
const uuidFake = sinon.fake.returns("123456789");

// Load code to test
const manager = proxyquire("../../../../utils/processTrigger/manager.js", {
   uuid: { v4: uuidFake },
   opossum: CircuitBreakerMock,
   "./queue.js": QueueMock,
   "../../queries/getTenants.js": getTenantsFake,
});

const mockReq = {
   tenantID: () => "Tenant1",
   controller: {},
   log: () => {},
};

// Test
describe("ProcessTriggerManager", () => {
   it("initProcessTriggerQueues() sets up CircuitBreaker and Queues", async () => {
      await manager.initProcessTriggerQueues(mockReq);

      assert(getTenantsFake.calledOnce);
      assert.equal(circuitFakes.constructor.callCount, 1);
      // Expect 2 Queue Instances to be created
      assert.equal(queueFakes.constructor.callCount, 2);
      assert.equal(queueFakes.init.callCount, 2);
      assert.equal(queueFakes.constructor.firstCall.firstArg, "Tenant1");
      assert.equal(queueFakes.constructor.secondCall.firstArg, "Tenant2");
   });

   it("registerProcessTrigger() sends request to circuit breaker", async () => {
      const jobData = {
         key: "mykey",
         data: {},
      };
      await manager.registerProcessTrigger(mockReq, jobData);
      // Should generate requestID using uuid()
      assert.equal(uuidFake.callCount, 1);
      assert.deepEqual(circuitFakes.fire.firstCall.args, [
         mockReq,
         { ...jobData, requestID: "123456789" },
      ]);
      // Should fire the circuit breaker
      assert(circuitFakes.fire.calledOnce);
   });

   it("fallback function sends add request to Queue", async () => {
      const jobData = {
         key: "mykey",
         data: {},
         requestID: "123",
      };
      await manager.initProcessTriggerQueues(mockReq);
      // Get the fallback function passed to the CircuitBreaker
      const fallbackFn = circuitFakes.fallback.firstCall.firstArg;
      const fallbackSpy = sinon.spy(fallbackFn);
      await fallbackSpy(mockReq, jobData);
      assert(fallbackSpy.calledOnce);
      assert.equal(queueFakes.add.callCount, 1);
      assert.deepEqual(queueFakes.add.firstCall.args, [mockReq, jobData]);
   });
});
