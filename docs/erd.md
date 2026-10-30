# Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    USERS ||--o{ CHARGERS : hosts
    USERS ||--o{ BOOKINGS : requests
    CHARGERS ||--o{ BOOKINGS : receives
    BOOKINGS ||--o| DEMO_PAYMENTS : has
    USERS ||--o{ REVIEWS : writes
    BOOKINGS ||--o| REVIEWS : reviewed_by

    USERS {
      uuid id PK
      string full_name
      string email UK
      string password_hash
      enum role
      boolean is_active
      datetime created_at
    }
    CHARGERS {
      uuid id PK
      uuid host_id FK
      string title
      string location_name
      float latitude
      float longitude
      string connector_type
      decimal power_kw
      decimal price_per_kwh
      enum charger_category
      boolean is_active
    }
    BOOKINGS {
      uuid id PK
      uuid charger_id FK
      uuid driver_id FK
      datetime starts_at
      datetime ends_at
      enum status
      datetime created_at
    }
    DEMO_PAYMENTS {
      uuid id PK
      uuid booking_id FK_UK
      decimal amount
      string currency
      enum status
      datetime created_at
    }
    REVIEWS {
      uuid id PK
      uuid booking_id FK_UK
      uuid reviewer_id FK
      integer rating
      string comment
      datetime created_at
    }
```

## Notes
- Roles: `driver`, `host`, `admin`. Public registration must never accept `admin` as a user-selected role.
- Charger category: `home` or `business`.
- Booking statuses: `pending`, `approved`, `rejected`, `cancelled`, `completed`.
- Payment status: `simulated` or `refunded`; these are demo records, not actual payment processor states.
- One booking can have at most one demo payment and one review in the initial model.
- Availability windows and audit events should be added in the next implementation phase.
