# API Contract: Cart

## GET /api/cart
- Response: 200 OK
```json
{
  "id": "...",
  "items": [{"product_id":"...","sku":"...","title":"...","unit_price_cents":1234,"quantity":2}],
  "subtotal_cents": 2468
}
```

## POST /api/cart/items
- Body:
```json
{ "product_id": "...", "quantity": 2 }
```
- Response: 200 OK (updated cart)

## PATCH /api/cart/items/{item_id}
- Body to change quantity:
```json
{"quantity": 3}
```
- Response: 200 OK (updated cart)

## DELETE /api/cart/items/{item_id}
- Response: 204 No Content
