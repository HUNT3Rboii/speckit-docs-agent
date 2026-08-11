# Order Processing Service

A fixture exercising every markdown construct the emitter claims to support.
This second line checks that a soft break stays a break.

## Architecture

The Storefront sends order requests to the **API Gateway**, which _authenticates_
the request and forwards it to the `OrderService`. See [the runbook](https://example.com/runbook)
for the escalation path.

### Request Flow

1. Storefront POSTs the cart
2. Gateway validates the JWT
   1. Signature check
   2. Expiry check
3. Order Service writes a pending row

## Status Lifecycle

- `pending` — written on creation
- `confirmed` — payment succeeded
  - `backordered` — stock unavailable
  - `cancelled` — support intervened
- `payment_failed` — provider declined

## Tasks

- [x] Implement OrderCreated event schema
- [x] Wire Payment Service to the sandbox
- [ ] Implement backorder retry scheduler
- [ ] Load test at 10x peak

## Configuration

| Setting | Default | Purpose |
|---------|---------|---------|
| `retry_interval` | 3600 | Seconds between backorder retries |
| `idempotency_ttl` | 86400 | How long a key blocks replays |
| `max_lines` | 200 | Order line ceiling |

## Example

```python
def reserve(order_id: str, warehouse: str) -> Reservation:
    """Reserve stock, or raise if the warehouse cannot fulfil."""
    if not _has_stock(order_id, warehouse):
        raise OutOfStock(order_id)
    return _commit(order_id, warehouse)
```

An inline snippet with a backtick inside: `` a ` b `` and one without: `plain`.

> Replaying the same OrderCreated event must never charge a customer twice.
> Idempotency is enforced with a unique key stored per event.

---

## Edge cases

Text with Typst-hostile characters: #hash, $dollar, *star*, _under_, <angle>,
@at, [bracket], ~tilde, and a backslash \\ for good measure.

- item whose text begins with - a dash
- item whose text begins with = an equals
