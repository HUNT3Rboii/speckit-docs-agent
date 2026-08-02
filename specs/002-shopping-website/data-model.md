# Data Model: Shopping Website

## Entities

### Product
- `id` (UUID) - primary key
- `sku` (string, unique) - stock keeping unit
- `title` (string)
- `description` (text)
- `price_cents` (integer) - price in cents to avoid floating point errors
- `currency` (string, e.g., "USD")
- `category` (string)
- `attributes` (jsonb) - optional key/value map for specs
- `available_quantity` (integer) - current inventory available
- `is_active` (boolean)
- `created_at`, `updated_at` (timestamps)

Validation:
- `price_cents` >= 0
- `sku` unique

### InventoryRecord
- `id` (UUID)
- `product_id` (UUID) - FK to Product
- `location` (string) - optional (warehouse)
- `adjustment` (integer) - positive or negative delta
- `reason` (string)
- `created_at` (timestamp)

Rules:
- Inventory updates are recorded as adjustments; available_quantity is derived via transactional updates or aggregates.

### Cart
- `id` (UUID)
- `customer_id` (nullable UUID) - links to Customer if logged in
- `session_id` (string) - browser session identifier
- `items` (jsonb) - array of { product_id, sku, title, unit_price_cents, quantity }
- `reserved_until` (timestamp) - optional reservation expiration
- `created_at`, `updated_at`

Rules:
- Cart item quantities cannot exceed current available inventory at reservation time.

### Order
- `id` (UUID)
- `order_number` (string) - human-friendly
- `customer_id` (UUID)
- `items` (jsonb) - snapshot of cart items at purchase time
- `subtotal_cents`, `tax_cents`, `shipping_cents`, `total_cents`
- `currency` (string)
- `shipping_address` (jsonb)
- `billing_address` (jsonb)
- `status` (enum: `pending_payment`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, `failed`)
- `created_at`, `updated_at`

Transitions:
- `pending_payment` -> `paid` on successful payment
- `paid` -> `processing` -> `shipped` -> `delivered`
- Refunds/cancellations recorded with associated PaymentAttempt/Refund records

### PaymentAttempt
- `id` (UUID)
- `order_id` (UUID)
- `provider` (string)
- `provider_charge_id` (string) - provider's id
- `status` (enum: `started`, `succeeded`, `failed`, `refunded`)
- `amount_cents`, `currency`
- `failure_reason` (nullable string)
- `created_at`, `updated_at`

### Customer
- `id` (UUID)
- `email` (string, unique)
- `name` (string)
- `hashed_password` (string) - if supporting native accounts; otherwise null
- `created_at`, `updated_at`

Privacy rules:
- Store minimal PII; encrypted fields for sensitive data where required.

## Relationships
- Product 1:N InventoryRecord
- Cart N:items → references Product snapshot data
- Order belongs to Customer
- Order 1:N PaymentAttempt

## Indexes & Constraints
- Index on `products(sku)`, `products(category)`, `products(title gin_trgm_ops)` for search acceleration
- Unique constraint on `customers(email)`
- Foreign key constraints for `order.customer_id`, `inventoryrecord.product_id`

## Eventing
- Emit events on: `cart.updated`, `checkout.started`, `payment.succeeded`, `inventory.adjusted`, `order.created` for observability and downstream integrations.
