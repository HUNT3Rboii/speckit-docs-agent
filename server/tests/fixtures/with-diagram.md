# Payment Flow

## Architecture

The gateway forwards to the order service.

```mermaid
graph TD
  Storefront --> Gateway
  Gateway --> OrderService
```

Text after the diagram.
