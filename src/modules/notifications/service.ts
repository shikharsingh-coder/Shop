import { outbox, type Message } from "./repo.ts";
import { eventBus } from "../../platform/event-bus.ts";

let n = 0;

export function send(to: string, subject: string): string {
  const id = `msg_${++n}`;
  outbox().set(id, { id, to, subject });
  return id;
}

export function sent(): Message[] {
  return [...outbox().values()];
}

eventBus.subscribe("order.placed", ({ orderId, email }) => {
  send(email, `Order ${orderId} confirmed`);
});
