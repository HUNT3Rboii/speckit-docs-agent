# API Contract: Catalog

## GET /api/products
- Query params: `q` (string), `category` (string), `page` (int), `per_page` (int)
- Response: 200 OK
```json
{
  "items": [{"id":"...","sku":"...","title":"...","price_cents":1234,"currency":"USD","available_quantity":10}],
  "page": 1,
  "per_page": 20,
  "total": 123
}
```

## GET /api/products/{id}
- Response: 200 OK
```json
{
  "id": "...",
  "sku": "...",
  "title": "...",
  "description": "...",
  "price_cents": 1234,
  "currency": "USD",
  "available_quantity": 5
}
```
