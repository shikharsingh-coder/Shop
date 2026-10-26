import { orders, type Order } from "./repo.ts";

import { eventBus } from "../../platform/event-bus.ts";
import { reserve } from "../inventory/index.ts";
import { charge } from "../payments/index.ts";

export type PlaceResult =
  | { ok: true; orderId: string; amountPaise: number }
  | { ok: false; reason: string };

export interface PlaceInput {
  sku: string;
  qty: number;
  unitPaise: number;
  email: string;
}

let n = 0;

export function placeOrder({ sku, qty, unitPaise, email }: PlaceInput): PlaceResult {
  const r = reserve(sku, qty);
  if (!r.ok) return { ok: false, reason: r.reason };

  const amountPaise = qty * unitPaise;
  const c = charge("pending", amountPaise);
  if (!c.ok) return { ok: false, reason: c.reason };

  const id = `ord_${++n}`;
  orders().set(id, { id, sku, qty, amountPaise, chargeId: c.chargeId });

  eventBus.publish("order.placed", { orderId: id, email, amountPaise });

  return { ok: true, orderId: id, amountPaise };
}

export function get(id: string): Order | null {
  return orders().get(id) ?? null;
}
