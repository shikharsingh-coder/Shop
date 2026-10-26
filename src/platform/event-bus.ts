/**
 * An in-process event bus.
 *
 * Requirements:
 *   - a handler that throws must not stop the other handlers
 *   - publish returns the number of handlers it reached
 *   - subscribing the same function twice registers it twice (do not dedupe)
 *   - publishing a name nobody listens to is fine and returns 0
 */

/** The events this system publishes. Add to it as you need to. */
export interface DomainEvents {
  "order.placed": { orderId: string; email: string; amountPaise: number };
}

export type EventName = keyof DomainEvents;
export type Handler<K extends EventName> = (payload: DomainEvents[K]) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  publish<K extends EventName>(name: K, payload: DomainEvents[K]): number;
  subscribe<K extends EventName>(name: K, fn: Handler<K>): Unsubscribe;
}

export function createEventBus(): EventBus {
  const handlers = new Map<EventName, Array<Handler<EventName>>>();

  return {
    publish(name, payload) {
      const subscribers = handlers.get(name);
      if (!subscribers) return 0;

      let reached = 0;
      for (const handler of [...subscribers]) {
        reached++;
        try {
          handler(payload);
        } catch {
          // One subscriber must not prevent delivery to the remaining subscribers.
        }
      }
      return reached;
    },
    subscribe(name, fn) {
      const subscribers = handlers.get(name) ?? [];
      subscribers.push(fn as Handler<EventName>);
      handlers.set(name, subscribers);

      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        const index = subscribers.indexOf(fn as Handler<EventName>);
        if (index !== -1) subscribers.splice(index, 1);
        if (subscribers.length === 0) handlers.delete(name);
      };
    },
  };
}

export const eventBus = createEventBus();
