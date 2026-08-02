# Order Processing Service

## Overview

This document specifies the Order Processing Service, a backend system responsible for accepting customer orders, validating payment, reserving inventory, and coordinating fulfillment. The service is designed to handle bursty traffic during sales events while maintaining strong consistency guarantees for payment and inventory operations. It replaces the legacy monolithic checkout module and introduces an event-driven architecture that decouples order intake from downstream processing. The goal is to reduce checkout latency from three seconds to under five hundred milliseconds while supporting at least ten times the current peak order volume without manual intervention.

## Architecture

The Storefront sends order requests to the API Gateway, which authenticates the request and forwards it to the Order Service. The Order Service validates the request and publishes an OrderCreated event to the Event Bus. The Payment Service subscribes to OrderCreated events, charges the customer through the external Payment Provider, and publishes a PaymentConfirmed event. The Inventory Service subscribes to PaymentConfirmed events and reserves stock from the Inventory Database. Once inventory is reserved, the Inventory Service publishes an OrderFulfilled event, which the Notification Service consumes to email the customer a confirmation.

## Request Flow

When a customer checks out, the Storefront sends a POST request to the API Gateway with the cart contents and payment token. The API Gateway validates the JWT and forwards the request to the Order Service. The Order Service writes a pending order record to the Order Database and publishes an OrderCreated event. The Payment Service receives the event, calls the Payment Provider's charge API, and on success publishes PaymentConfirmed back to the Event Bus. The Order Service listens for PaymentConfirmed and updates the order status to `confirmed`, returning a response to the Storefront only after this final state is reached.

## Order Status Lifecycle

An order starts in the `pending` state immediately after creation. It transitions to `confirmed` once payment succeeds, or to `payment_failed` if the Payment Provider declines the charge. From `confirmed`, the order moves to `fulfilled` once the Inventory Service reserves stock and ships the item, or to `backordered` if stock is unavailable. A `backordered` order automatically retries inventory reservation every hour and moves to `fulfilled` once stock arrives, or can be manually moved to `cancelled` by support staff.
 
## Data Model
 
An Order has one Customer and contains one or more OrderLine entries. Each OrderLine references exactly one Product and records the quantity and unit price at time of purchase. A Payment record references its Order and stores the Payment Provider's transaction ID. An InventoryReservation references an OrderLine and a Warehouse, tracking how many units were reserved from that location. 
 
## Glossary Notes

The system relies on **idempotent** request handling: replaying the same `OrderCreated` event must never charge a customer twice or reserve inventory twice, achieved via a unique `idempotency_key` stored per event. Communication between services follows an **event sourcing** pattern, where the Order Database's state is always derived by replaying the ordered sequence of domain events rather than being mutated directly. Authentication uses `JWT` (JSON Web Tokens) issued by the API Gateway with a 15-minute expiry.

## User Stories

As a customer, I want to receive an email confirmation within one minute of a successful order so that I have proof of purchase without needing to check the website. 

As a support agent, I want to manually cancel a backordered order so that I can process refunds for customers who no longer want to wait for restocked inventory.
 
## Tasks

- [x] Implement OrderCreated event schema and publisher
- [x] Wire Payment Service to external Payment Provider sandbox  
- [ ] Implement backorder retry scheduler 
- [ ] Add idempotency key deduplication to the Event Bus consumer 
- [ ] Load test API Gateway at 10x current peak traffic   
 
## Design Decision: Event Bus Choice  
  
We evaluated using direct synchronous HTTP calls between services versus an asynchronous Event Bus. We chose the Event Bus approach because it allows the Payment Service and Inventory Service to scale independently and to retry failed operations without blocking the customer-facing checkout request. The tradeoff is increased operational complexity: we now need dead-letter queues, event replay tooling, and careful schema versioning for every event type to avoid breaking downstream consumers during deploys.    
 