import { test } from "node:test";
import assert from "node:assert/strict";
import { createEventBus } from "../src/platform/event-bus.ts";
import { reset } from "../src/platform/db.ts";
import { seed } from "../src/modules/inventory/repo.ts";
import { placeOrder } from "../src/modules/orders/index.ts";
import { sent } from "../src/modules/notifications/index.ts";

const payload = { orderId: "ord_1", email: "a@example.com", amountPaise: 100 };

test("a published event reaches its subscribers", () => {
  const bus = createEventBus();
  const seen: string[] = [];
  bus.subscribe("order.placed", (p) => seen.push(p.orderId));
  assert.equal(bus.publish("order.placed", payload), 1);
  assert.deepEqual(seen, ["ord_1"]);
});

test("nobody listening is fine", () => {
  assert.equal(createEventBus().publish("order.placed", payload), 0);
});

test("one handler throwing does not stop the others", () => {
  const bus = createEventBus();
  const seen: string[] = [];
  bus.subscribe("order.placed", () => { throw new Error("boom"); });
  bus.subscribe("order.placed", () => seen.push("second"));
  assert.equal(bus.publish("order.placed", payload), 2);
  assert.deepEqual(seen, ["second"]);
});

test("unsubscribe stops delivery", () => {
  const bus = createEventBus();
  let n = 0;
  const off = bus.subscribe("order.placed", () => { n += 1; });
  bus.publish("order.placed", payload);
  off();
  bus.publish("order.placed", payload);
  assert.equal(n, 1);
});

test("subscribing the same handler twice registers two deliveries", () => {
  const bus = createEventBus();
  let n = 0;
  const handler = () => { n += 1; };
  const offFirst = bus.subscribe("order.placed", handler);
  bus.subscribe("order.placed", handler);

  assert.equal(bus.publish("order.placed", payload), 2);
  assert.equal(n, 2);
  offFirst();
  assert.equal(bus.publish("order.placed", payload), 1);
  assert.equal(n, 3);
});

test("publish counts only handlers in the delivery snapshot", () => {
  const bus = createEventBus();
  let n = 0;
  bus.subscribe("order.placed", () => {
    bus.subscribe("order.placed", () => { n += 1; });
  });

  assert.equal(bus.publish("order.placed", payload), 1);
  assert.equal(n, 0);
  assert.equal(bus.publish("order.placed", payload), 2);
  assert.equal(n, 1);
});

test("orders publishes order.placed, and notifications subscribes to it", () => {
  reset();
  seed();
  const result = placeOrder({
    sku: "sku-1",
    qty: 1,
    unitPaise: 45000,
    email: "a@example.com",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(sent().map(({ to, subject }) => ({ to, subject })), [
    { to: "a@example.com", subject: "Order ord_1 confirmed" },
  ]);
});
