# API Contract: Checkout & Orders

## POST /api/checkout
- Body:
```json
{
  "cart_id": "...",
  "shipping_address": {"street":"...","city":"...","postal_code":"...","country":"..."},
  "payment_method": {"type":"stripe_checkout_session"}
}
```
- Response: 200 OK
```json
{ "order_id": "...", "payment_url": "https://stripe.com/..." }
```

## GET /api/orders/{order_id}
- Response: 200 OK
```json
{
  "id": "...",
  "order_number": "ORD-0001",
  "status": "processing",
  "items": [...],
  "total_cents": 2999
}
```

## POST /api/orders/{order_id}/refund
- Body: `{ "reason": "customer_request" }`
- Response: 202 Accepted (refund processing)
