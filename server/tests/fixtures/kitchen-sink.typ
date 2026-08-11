= Order Processing Service

A fixture exercising every markdown construct the emitter claims to support. \
This second line checks that a soft break stays a break.

== Architecture

The Storefront sends order requests to the *API Gateway*, which _authenticates_ \
the request and forwards it to the #raw("OrderService"). See #link("https://example.com/runbook")[the runbook] \
for the escalation path.

=== Request Flow

+ Storefront POSTs the cart
+ Gateway validates the JWT
  + Signature check
  + Expiry check
+ Order Service writes a pending row

== Status Lifecycle

- #raw("pending") — written on creation
- #raw("confirmed") — payment succeeded
  - #raw("backordered") — stock unavailable
  - #raw("cancelled") — support intervened
- #raw("payment_failed") — provider declined

== Tasks
#section-label("task")

- `[x]` Implement OrderCreated event schema
- `[x]` Wire Payment Service to the sandbox
- `[ ]` Implement backorder retry scheduler
- `[ ]` Load test at 10x peak

== Configuration

#table(
  columns: 3,
  table.header([*Setting*], [*Default*], [*Purpose*]),
  [#raw("retry_interval")], [3600], [Seconds between backorder retries],
  [#raw("idempotency_ttl")], [86400], [How long a key blocks replays],
  [#raw("max_lines")], [200], [Order line ceiling],
)

== Example

```python
def reserve(order_id: str, warehouse: str) -> Reservation:
    """Reserve stock, or raise if the warehouse cannot fulfil."""
    if not _has_stock(order_id, warehouse):
        raise OutOfStock(order_id)
    return _commit(order_id, warehouse)
```

An inline snippet with a backtick inside: #raw("a ` b") and one without: #raw("plain").

#quote(block: true)[
Replaying the same OrderCreated event must never charge a customer twice. \
Idempotency is enforced with a unique key stored per event.
]

#line(length: 100%, stroke: 0.5pt + luma(180))

== Edge cases

Text with Typst-hostile characters: \#hash, \$dollar, _star_, _under_, \<angle\>, \
\@at, \[bracket\], \~tilde, and a backslash \\ for good measure.

- item whose text begins with - a dash
- item whose text begins with = an equals
