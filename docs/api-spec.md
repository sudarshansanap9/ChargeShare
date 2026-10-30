# ChargeShare API specification (planned contract)

Base URL: `/api/v1`. JSON request and response bodies unless noted. The initial runnable scaffold currently implements only `/` and `/health`; the routes below are the agreed implementation contract, not claims that all endpoints are implemented yet. Authentication uses `Authorization: Bearer <access_token>`.

## System
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Health check |
| GET | `/` | Public | API metadata |

## Authentication
| Method | Path | Auth | Request / response |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | `{full_name,email,password}`; server assigns `driver` by default |
| POST | `/api/v1/auth/login` | Public | OAuth2 form or documented JSON login; returns `{access_token,token_type,expires_in}` |
| GET | `/api/v1/auth/me` | User | Current user's safe profile; never returns password hash |

Validation: normalize email; enforce password length; hash with Argon2; use generic invalid-login errors; rate-limit public auth endpoints before public deployment.

## Chargers
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/chargers` | Public | Search with `q`, `category`, `connector_type`, `min_power_kw`, `max_price`, `lat`, `lng`, `radius_km`, `start_at`, `end_at`, `page`, `page_size` |
| GET | `/api/v1/chargers/{charger_id}` | Public | Charger detail; do not expose exact private address before an approved booking if host privacy requires it |
| POST | `/api/v1/chargers` | Host | Create a listing |
| PATCH | `/api/v1/chargers/{charger_id}` | Owning host/admin | Update own listing |
| DELETE | `/api/v1/chargers/{charger_id}` | Owning host/admin | Prefer soft-deactivation if bookings exist |

Charger body: `{title,description,location_name,latitude,longitude,connector_type,power_kw,price_per_kwh,charger_category,is_active}`. Server derives `host_id` from the token, not from client input.

## Bookings
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/bookings` | Driver | Request `{charger_id,starts_at,ends_at}`; starts as `pending` |
| GET | `/api/v1/bookings/me` | User | Current user's bookings; hosts can use a separate host endpoint |
| GET | `/api/v1/host/bookings` | Host | Requests for chargers owned by this host |
| POST | `/api/v1/bookings/{booking_id}/approve` | Owning host | Approve only if slot is still free; transaction-safe conflict check |
| POST | `/api/v1/bookings/{booking_id}/reject` | Owning host | Reject pending request |
| POST | `/api/v1/bookings/{booking_id}/cancel` | Relevant driver/host | Apply cancellation policy |
| POST | `/api/v1/bookings/{booking_id}/complete` | Relevant host/admin in demo | Mark session complete; no hardware is controlled |

Use ISO 8601 timestamps with offsets; normalize to UTC. Reject past start times and `ends_at <= starts_at`. Prevent overlapping approved reservations in the database transaction.

## Simulated payments
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/bookings/{booking_id}/demo-payment` | Booking driver | Create a clearly simulated payment record; never call a payment provider |
| GET | `/api/v1/payments/me` | User | List only the current user's relevant demo records |

Response must include `mode: "simulated"`. Never request or store card details, UPI PINs, OTPs, or bank credentials.

## Reviews and moderation
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/bookings/{booking_id}/review` | Driver with completed booking | One 1–5-star review per eligible booking |
| GET | `/api/v1/chargers/{charger_id}/reviews` | Public | Paginated reviews |
| POST | `/api/v1/reports` | User | Report a listing or booking |
| GET | `/api/v1/admin/reports` | Admin | Review submitted reports |
| PATCH | `/api/v1/admin/chargers/{charger_id}/moderation` | Admin | Moderate/deactivate listing |

## Error shape
```json
{
  "detail": {
    "code": "BOOKING_CONFLICT",
    "message": "This charger is no longer available for that time slot."
  }
}
```
Use standard HTTP status codes: 400 invalid workflow, 401 unauthenticated, 403 forbidden, 404 missing resource, 409 booking conflict, 422 invalid request, 500 unexpected server error. Avoid leaking stack traces or private listing details.

## Pagination
Use `page` (default 1) and `page_size` (default 20, maximum 100). Suggested list response: `{items:[],page:1,page_size:20,total:0}`.
