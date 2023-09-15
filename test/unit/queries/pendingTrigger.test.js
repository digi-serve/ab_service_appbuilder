const pendingTriggerTable = require("../../../queries/pendingTrigger.js");
const sinon = require("sinon");
const assert = require("assert");

const mockReq = {
   query: (sql, data, cb) => cb(),
   queryTenantDB: sinon.fake.returns("`mydb`"),
};
const spyQuery = sinon.spy(mockReq, "query");

describe("pendingTrigger queries", () => {
   beforeEach(() => {
      spyQuery.resetHistory();
   });

   it("create() calls query with expected sql", () => {
      pendingTriggerTable.create(mockReq, {
         requestID: "123",
         key: "key",
         data: { data: 1 },
         user: { username: "admin" },
      });
      assert(spyQuery.calledOnce);
      const expectedSql =
         "INSERT INTO `mydb`.`SITE_PENDING_TRIGGER` (`uuid`, `created_at`, `updated_at`, `key`, `data`, `user`) VALUES (?, NOW(), NOW(), ?, ?, ?)";
      const expectedValues = [
         "123",
         "key",
         '{"data":1}',
         '{"username":"admin"}',
      ];
      assert.equal(spyQuery.firstCall.args[0], expectedSql);
      assert.deepEqual(spyQuery.firstCall.args[1], expectedValues);
   });

   it("remove() calls query with expected sql", () => {
      pendingTriggerTable.remove(mockReq, "123");
      assert(spyQuery.calledOnce);
      const expectedSql =
         "DELETE FROM `mydb`.`SITE_PENDING_TRIGGER` WHERE (`uuid` = ?)";
      assert.equal(spyQuery.firstCall.args[0], expectedSql);
      assert.deepEqual(spyQuery.firstCall.args[1], ["123"]);
   });

   it("list() calls query with expected sql", () => {
      pendingTriggerTable.list(mockReq, "123");
      assert(spyQuery.calledOnce);
      const expectedSql = "SELECT * FROM `mydb`.`SITE_PENDING_TRIGGER`";
      assert.equal(spyQuery.firstCall.args[0], expectedSql);
      assert.deepEqual(spyQuery.firstCall.args[1], []);
   });
});
