import { strict as assert } from "node:assert";
import { test } from "vitest";
import { parseConnectionDeepLink } from "../../apps/desktop/src/lib/connectionDeepLink.ts";

test("parses task connection deep link query fields", () => {
  const draft = parseConnectionDeepLink("task://connection/new?type=postgres&host=db.internal&port=15432&user=app&database=orders&name=Orders");

  assert.deepEqual(draft, {
    name: "Orders",
    dbType: "postgres",
    driverProfile: "postgres",
    driverLabel: "PostgreSQL",
    host: "db.internal",
    port: 15432,
    username: "app",
    password: undefined,
    database: "orders",
    urlParams: undefined,
    ssl: false,
  });
});

test("parses encoded database URL with password", () => {
  const draft = parseConnectionDeepLink("task://connection/new?url=postgres%3A%2F%2Fapp%3Asecret%40db.internal%3A5432%2Forders%3Fsslmode%3Drequire");

  assert.equal(draft?.dbType, "postgres");
  assert.equal(draft?.driverProfile, "postgres");
  assert.equal(draft?.host, "db.internal");
  assert.equal(draft?.port, 5432);
  assert.equal(draft?.username, "app");
  assert.equal(draft?.password, "secret");
  assert.equal(draft?.database, "orders");
  assert.equal(draft?.urlParams, "sslmode=require");
});

test("allows password query field to override database URL password", () => {
  const draft = parseConnectionDeepLink("task://connection/new?url=postgres%3A%2F%2Fapp%3Asecret%40db.internal%3A5432%2Forders&password=override");

  assert.equal(draft?.password, "override");
});

test("parses boolean control parameters consistently", () => {
  const draft = parseConnectionDeepLink("task://connection/new?type=mysql&ssl=1&one_time=yes");

  assert.equal(draft?.ssl, true);
  assert.equal(draft?.oneTime, true);
});

test("ignores unsupported task deep link targets", () => {
  assert.equal(parseConnectionDeepLink("task://query/open?sql=select%201"), null);
  assert.equal(parseConnectionDeepLink("task://connections/new?type=postgres"), null);
});
