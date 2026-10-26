# Extraction plan: Notifications

## Why extract notifications first

Notifications is the lowest-risk first module to extract. It already reacts to
the `order.placed` event instead of being called directly by orders, and sending
a confirmation is a side effect that should not determine whether an order
succeeds. Its current responsibilities are small: format a confirmation and
write it to an outbox.

The boundary is not ready for a production extraction yet. The event bus is
in-process and synchronous, and notification records are stored through the
shared in-memory database. The steps below make those dependencies explicit and
replace them before moving the consumer into a separate process.

## Five extraction steps

### 1. Choose and define the boundary

Extract the notifications module, keeping ownership of confirmation formatting,
delivery, retries, and notification records inside that module. Orders remains
responsible for accepting an order and publishing `order.placed`; it must not
call a notification API or know how messages are sent.

Keep the existing event payload as the starting contract
(`orderId`, `email`, and `amountPaise`). Add a stable event identifier and a
schema version before making delivery asynchronous, so the consumer can
deduplicate messages and evolve the payload safely.

### 2. Replace in-process communication with a reliable contract

Replace the shared in-process event bus with a durable broker. Publish a
versioned `order.placed` message and have the notifications service consume it.
Do not rely on an in-memory publish succeeding: record the event in an
orders-owned transactional outbox along with the order, then relay outbox
entries to the broker with retries.

Add contract tests for the event schema and consumer behavior. The producer
should not wait for email delivery, and a notification failure should not
reverse or fail an already-accepted order.

### 3. Give notifications ownership of its data and delivery lifecycle

Move notification/outbox persistence out of the shared `platform/db.ts` store
into a notifications-owned database or storage boundary. Track the event ID as
an idempotency key so redelivery cannot send duplicate confirmations. Persist
delivery status and retry metadata, retry transient provider failures, and send
messages that exceed the retry policy to a dead-letter queue for inspection.

Keep provider credentials in the notifications service's secret configuration;
do not add them to orders or the shared event payload.

### 4. Deploy notifications as a separate service

Create a separately deployable notifications worker that owns the broker
subscription, its storage, and email-provider integration. Add configuration,
health/readiness checks, structured logs, and metrics for delivery attempts,
failures, retries, dead-lettered events, and consumer lag.

Keep the module's public event contract independent of TypeScript module paths
and the current `eventBus` singleton. The orders application should require
only the broker/outbox publisher, not the notifications runtime.

### 5. Cut over gradually and verify the extraction

Run the new consumer in a non-sending validation mode first and compare consumed
events with expected orders. Then enable delivery for a small canary and verify
successful confirmations, idempotent redelivery, retry behavior, dead-letter
handling, and that notification outages do not affect order placement.

Use delivery and lag metrics to expand traffic gradually. Define a rollback
that stops or redirects the new consumer without running two active senders;
the idempotency key remains a safeguard against replay duplicates. After the
new service is stable, remove the in-process notifications subscription and
shared-store access, and document operational ownership and recovery procedures.
