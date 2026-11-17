# BNC Motors API

The API is the ordering backend for BNC Motors. Customers register, browse products, place cart orders, upload purchase-order PDFs, review catalogue matches, and convert accepted lines into orders. Administrators manage products, stock, orders, and purchase-order records.

The process entry is `server/src/server.js`. It loads `server/.env` and starts the Express application in `server/src/app.js`. Routes delegate to controllers. Controllers validate input and call models. Models run parameterized SQL through a `pg` pool (`server/src/config/db.js`, maximum 5 clients). Purchase-order text extraction and catalogue matching live in `server/src/services`.

Authentication is a JWT. The payload is `{ id, role }` and `expiresIn` is `1d`. Protected routes read `Authorization: Bearer <token>`.

## Response format

Successful JSON responses use:

```json
{
  "success": true,
  "message": "Optional short message",
  "data": {}
}
```

`message` is omitted when the handler does not set it. `GET /api/health` does not use `data`.

Failed JSON responses use:

```json
{
  "success": false,
  "message": "Reason the request was rejected"
}
```

A failed purchase-order upload that still saves a row also includes `data.purchase_order`. The PDF download route returns the file bytes, not this JSON envelope.

`pg` has no custom type parser in this project. `bigint` identity values and `numeric` money values are JSON strings. `integer` quantities are JSON numbers. `timestamp with time zone` values are ISO-8601 strings. Examples below follow that.

Example ids, order numbers, timestamps, and summary counts show the response shape. They are not a dump of a live database. Catalogue name, SKU, brand, unit, price, stock, and reorder level in the product examples match the first product in `database/seed.sql` when that file is applied to an empty products table. The registration phone and district must still pass the validators described for that route.

## Base URL

Local default:

```text
http://localhost:5000
```

`PORT` in `server/.env` overrides `5000`. Restart the API after changing it. The Vite dev server proxies `/api` to `http://localhost:5000`, so the browser application can call `/api/...` with `VITE_API_URL` unset. CORS allows `CLIENT_URL`, or `http://localhost:5173` when that variable is omitted.

Send `Content-Type: application/json` for JSON bodies. The upload route uses `multipart/form-data`.

## Authentication

Register creates a `customer` only. It does not return a token. Login checks the bcrypt hash and returns a token when the account is active. `GET /api/auth/me` returns the same public user fields.

Roles stored on users are `customer` and `admin`. Registration cannot create an admin. The seed file inserts the admin account.

A missing, malformed, or expired bearer token returns `401` with `"Authentication required"` or `"Invalid or expired token"`. A valid token with the wrong role returns `403` with `"You are not allowed to perform this action"`.

Login example:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "customer@bncmotors.com",
  "password": "BncCustomer#2026"
}
```

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "2",
      "name": "BNC Motors Customer",
      "email": "customer@bncmotors.com",
      "phone": "9845098765",
      "company_name": "Metro Auto Garage",
      "country": null,
      "country_code": null,
      "state": null,
      "district": null,
      "role": "customer",
      "is_active": true,
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

The token value is issued at login. Do not copy a token from a running environment into source. Seeded emails and passwords are local demo accounts; `database/seed.sql` stores password hashes only. Seeded users have no country, state, or district because the seed insert does not set those columns.

Use the token as:

```http
Authorization: Bearer <jwt>
```

## Authentication and health

### `GET /api/health`

| | |
|---|---|
| Authentication | None |
| Headers | None required |

Response `200`:

```json
{
  "success": true,
  "message": "BNC Motors API is running!",
  "timestamp": "2026-11-17T12:00:00.000Z"
}
```

### `POST /api/auth/register`

| | |
|---|---|
| Authentication | None |
| Headers | `Content-Type: application/json` |

Body:

| Field | Rule |
|---|---|
| `name` | Required text, at most 100 characters |
| `email` | Required, at most 150 characters, must contain `@` and a dot in the domain. Stored lowercase |
| `password` | Required, 8 to 72 characters. Hashed with bcrypt cost 10. Not returned |
| `phone` | Required text. Must match `+` and digits, start with the country calling code, be at most 20 characters, and be a valid number for that country |
| `company_name` | Required text, at most 150 characters |
| `country` | Required, at most 100 characters. Must match the library name for `country_code` |
| `country_code` | Required two-letter code |
| `state` | Required, at most 150 characters. Must be a subdivision of that country |
| `district` | Required when that state has districts, and must be one of them. Must be omitted or empty when the state has no districts |

Country, state, and district names come from `world-country-state-district`. The comparison is case-insensitive, and the stored names are the library names.

```json
{
  "name": "Asha Rao",
  "email": "asha@example.com",
  "password": "example-password",
  "phone": "+919845011111",
  "company_name": "Rao Garage",
  "country": "India",
  "country_code": "IN",
  "state": "Karnataka",
  "district": "Bengaluru Urban"
}
```

`district` must be a name the installed library returns for that state. A mismatch returns `400`.

Response `201`:

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "15",
      "name": "Asha Rao",
      "email": "asha@example.com",
      "phone": "+919845011111",
      "company_name": "Rao Garage",
      "country": "India",
      "country_code": "IN",
      "state": "Karnataka",
      "district": "Bengaluru Urban",
      "role": "customer",
      "is_active": true,
      "created_at": "2026-11-17T12:00:00.000Z",
      "updated_at": "2026-11-17T12:00:00.000Z"
    }
  }
}
```

Errors:

| Status | Message |
|---|---|
| 400 | The first failing validation message, including `"Name, email, password, phone, and company name are required"`, `"Phone must be text"`, `"A valid email address is required"`, `"A valid country is required"`, `"State is not valid for the selected country"`, `"A valid district is required"`, `"District is not valid for the selected state"`, `"A valid mobile number is required"`, `"Password must be between 8 and 72 characters"` |
| 409 | `"An account with this email already exists"` |
| 500 | `"Internal server error"` |

### `POST /api/auth/login`

| | |
|---|---|
| Authentication | None |
| Headers | `Content-Type: application/json` |

Body: `email`, `password`. Both are required. Email is trimmed and lowercased.

Response `200` is the login example in Authentication. `password_hash` is never included.

Errors:

| Status | Message |
|---|---|
| 400 | `"Email and password are required"` |
| 401 | `"Invalid email or password"` |
| 403 | `"Account is inactive"` |
| 500 | `"Internal server error"`, including when `JWT_SECRET` is not set |

### `GET /api/auth/me`

| | |
|---|---|
| Authentication | Any valid token |
| Headers | `Authorization: Bearer <jwt>` |

Response `200`:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "2",
      "name": "BNC Motors Customer",
      "email": "customer@bncmotors.com",
      "phone": "9845098765",
      "company_name": "Metro Auto Garage",
      "country": null,
      "country_code": null,
      "state": null,
      "district": null,
      "role": "customer",
      "is_active": true,
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

Errors: `401` `"Authentication required"` when the user row is gone; `403` `"Account is inactive"`; `500` `"Internal server error"`. Invalid tokens are rejected by middleware before this handler.

## Products

Product JSON fields are `id`, `name`, `sku`, `description`, `image_url`, `category`, `brand`, `unit`, `price`, `currency`, `stock_quantity`, `reorder_level`, `is_active`, `created_at`, `updated_at`.

Search matches `name`, `sku`, or `brand` with a case-insensitive `ILIKE` pattern. `category` is an exact case-insensitive match. There is no search-length limit on this route. `page` defaults to 1. `limit` defaults to 10 and cannot exceed 100. Results are ordered by name, then id.

`status` defaults to `active`. `inactive` and `all` require an admin token. A customer or anonymous caller asking for those values receives `401` or `403`.

Catalogue reads of one active product are public. An inactive product is returned only when the optional bearer token belongs to an admin. Other callers receive `404` `"Product not found"`.

Opening stock may be sent on create. Later stock changes are not accepted on product update. `PUT` rejects a different `stock_quantity` with `400` `"Stock quantity can only be changed from Inventory"`. Sending the current quantity is ignored. If that was the only field, the response is `400` `"No product fields to update"`.

`DELETE` sets `is_active` to false and returns the product. It does not remove the row.

### `GET /api/products`

Authentication: public for active products. Admin token required for `status=inactive` or `status=all`.

Query: `page`, `limit`, `search`, `category`, `status` (`active`, `inactive`, `all`).

```http
GET /api/products?page=1&limit=10&search=brake&category=Brakes&status=active
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "1",
        "name": "Front Ceramic Brake Pad Set",
        "sku": "BNC-BP-FR-01",
        "description": "Ceramic front brake pads for passenger cars. Includes wear indicators and anti-squeal shims for both front wheels.",
        "image_url": null,
        "category": "Brakes",
        "brand": "Bosch",
        "unit": "set",
        "price": "2499.00",
        "currency": "INR",
        "stock_quantity": 48,
        "reorder_level": 12,
        "is_active": true,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

Errors: `400` `"Page must be a positive whole number"`, `"Limit must be a positive whole number"`, `"Limit cannot exceed 100"`, `"Status filter is not valid"`, or `"Search, category, and status must be single values"`. `401` or `403` for a restricted status. `503` `"Database is temporarily unavailable"`. `500` `"Internal server error"`.

### `GET /api/products/:id/related`

Authentication: public for an active product. An admin token can request related products for an inactive product.

Query: `limit`, default 4, maximum 4.

Related products are other active products scored from the source name, SKU, category, and brand. Each item has `id`, `name`, `sku`, `brand`, `category`, `image_url`, `price`, `currency`, `stock_quantity`.

Response `200`:

```json
{
  "success": true,
  "data": {
    "products": [],
    "limit": 4
  }
}
```

Errors: `400` `"A valid product id is required"`, `"Limit must be a single value"`, `"Limit must be a positive whole number"`, `"Limit cannot exceed 4"`. `404` `"Product not found"`. `503` or `500` as on the list route.

### `GET /api/products/:id`

Authentication: public for an active product. Admin token to read an inactive product.

Response `200`: `{ "success": true, "data": { "product": { } } }` with the product fields above.

Errors: `400` `"A valid product id is required"`. `404` `"Product not found"`. `500` `"Internal server error"`.

### `POST /api/products`

Authentication: admin.

Required: `name` (1–150), `sku` (1–50), `price` (nonnegative, up to 2 decimal places, maximum `9999999999.99`).

Optional: `description` (5000), `stock_quantity` (default 0), `reorder_level` (default 0), `category` (100), `brand` (100), `image_url` (2048), `unit` (default `pcs`, max 20), `currency` (default `INR`, three letters, stored uppercase).

Creating a product does not write an inventory movement.

```json
{
  "name": "Workshop Oil Filter",
  "sku": "BNC-DOC-EXAMPLE",
  "price": "450.00",
  "category": "Filters",
  "brand": "BNC",
  "unit": "pcs",
  "currency": "INR",
  "stock_quantity": 40,
  "reorder_level": 8
}
```

`BNC-OF-220` is already inserted by `database/seed.sql`. Creating that SKU again returns `409`.

Response `201`:

```json
{
  "success": true,
  "message": "Product created",
  "data": { "product": {} }
}
```

Errors: `400` for a validation failure, including `"Name, SKU, and price are required"`. `409` `"A product with this SKU already exists"`. `500` `"Internal server error"`.

### `PUT /api/products/:id`

Authentication: admin.

Send one or more of `name`, `sku`, `description`, `price`, `stock_quantity`, `category`, `brand`, `image_url`, `unit`, `currency`, `reorder_level`. Empty optional text clears that column. `unit` and `currency` cannot be cleared. Unknown keys alone do not count as an update.

Response `200`: `{ "success": true, "message": "Product updated", "data": { "product": {} } }`.

Errors: `400` `"A valid product id is required"`, `"No product fields to update"`, `"Stock quantity can only be changed from Inventory"`, or a field validation message. `404` `"Product not found"`. `409` `"A product with this SKU already exists"`. `500` `"Internal server error"`.

### `PATCH /api/products/:id/status`

Authentication: admin.

Body must be exactly `{ "is_active": true }` or `{ "is_active": false }`.

Response `200`: message `"Product activated"` or `"Product deactivated"`, and `data.product`.

Errors: `400` `"A valid product id is required"` or `"is_active must be true or false"`. `404` `"Product not found"`. `500` `"Internal server error"`.

### `PATCH /api/products/:id/stock`

Authentication: admin. This is the manual inventory adjustment. Details are in Inventory.

### `DELETE /api/products/:id`

Authentication: admin. Soft delete.

Response `200`:

```json
{
  "success": true,
  "message": "Product deactivated",
  "data": { "product": { "is_active": false } }
}
```

Errors: `400` `"A valid product id is required"`. `404` `"Product not found"`. `500` `"Internal server error"`.

## Orders

An order is created from the customer cart or from accepted purchase-order lines. The client sends product ids and quantities. The server loads catalogue `price`, rejects inactive or missing products, and rejects a quantity above `stock_quantity`. Tax and shipping are calculated as `0.00`. The order number is `BNC-ORD-` plus the id, padded to at least 6 digits. Payment status is stored as `pending`. The client cannot set payment status or price.

Cart checkout calls `POST /api/orders` and records movement type `order_deduction`. Purchase-order confirmation uses the same order transaction with movement type `po_conversion_deduction` and payment method `pay_later`.

Cancellation is an admin status change to `cancelled`. The same transaction adds the line quantities back and writes `order_restoration`. A second cancel is not a legal transition, so stock is not restored again. If a product row needed for restoration is missing, the status is `409` `"Stock could not be restored for this order"`.

Allowed status changes:

| From | To |
|---|---|
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `processing`, `cancelled` |
| `processing` | `shipped`, `cancelled` |
| `shipped` | `delivered` |
| `delivered` | none |
| `cancelled` | none |

`GET /api/orders` and `GET /api/orders/:id` set `source` from `purchase_order_orders`. A linked row is `purchase_order` and includes `purchase_order: { id, po_number }`. No link is `cart_checkout` and `purchase_order: null`. The link is not inferred from the order number. `GET /api/orders/my` does not add `source` or `purchase_order`.

Admin list rows include `customer` (`id`, `name`, `email`, `phone`, `company_name`). Customer list rows do not. Detail responses include `customer` for both roles. List and detail both include `items`.

Order fields: `id`, `order_number`, `user_id`, `subtotal`, `tax_amount`, `shipping_charge`, `total_amount`, `status`, `payment_method`, `payment_status`, `shipping_address`, `billing_address`, `notes`, `created_at`, `updated_at`, `items`.

Item fields: `id`, `order_id`, `product_id`, `product_name`, `product_sku`, `quantity`, `unit_price`, `line_total`, `tax_amount`, `created_at`.

`page` defaults to 1. `limit` defaults to 10 and max is 100. Dates are `YYYY-MM-DD`. `from` cannot be after `to`.

Admin status counts and source counts are global. They do not follow the list filters. Customer counts follow search and date, and do not follow the status filter. Customer search matches the order number or an item name or SKU. Admin search matches order number, customer name, email, company, or phone.

### `POST /api/orders`

Authentication: customer.

| Field | Rule |
|---|---|
| `items` | Required array, 1 to 50 objects. Each has `product_id` (positive whole number) and `quantity` (positive whole number, max 100000). Duplicate product ids are rejected. Quantity may be a JSON number or a numeric string |
| `shipping_address` | Optional object, JSON length at most 5000 |
| `billing_address` | Optional object, JSON length at most 5000 |
| `notes` | Optional text, at most 2000 characters |
| `payment_method` | Optional. `pay_later` or `cod`. Omitted or blank becomes `pay_later` |

```json
{
  "items": [
    { "product_id": 1, "quantity": 2 }
  ],
  "shipping_address": {
    "line1": "12 Industrial Area",
    "city": "Bengaluru",
    "postal_code": "560001"
  },
  "billing_address": {
    "line1": "12 Industrial Area",
    "city": "Bengaluru"
  },
  "notes": "Deliver to the parts counter",
  "payment_method": "cod"
}
```

Address keys are stored as submitted. The API does not require a fixed address schema.

Response `201`:

```json
{
  "success": true,
  "message": "Order created",
  "data": {
    "order": {
      "id": "21",
      "order_number": "BNC-ORD-000021",
      "user_id": "2",
      "subtotal": "4998.00",
      "tax_amount": "0.00",
      "shipping_charge": "0.00",
      "total_amount": "4998.00",
      "status": "pending",
      "payment_method": "cod",
      "payment_status": "pending",
      "shipping_address": { "line1": "12 Industrial Area", "city": "Bengaluru", "postal_code": "560001" },
      "billing_address": { "line1": "12 Industrial Area", "city": "Bengaluru" },
      "notes": "Deliver to the parts counter",
      "created_at": "2026-11-17T12:00:00.000Z",
      "updated_at": "2026-11-17T12:00:00.000Z",
      "items": [
        {
          "id": "40",
          "order_id": "21",
          "product_id": "1",
          "product_name": "Front Ceramic Brake Pad Set",
          "product_sku": "BNC-BP-FR-01",
          "quantity": 2,
          "unit_price": "2499.00",
          "line_total": "4998.00",
          "tax_amount": "0.00",
          "created_at": "2026-11-17T12:00:00.000Z"
        }
      ]
    }
  }
}
```

This create payload does not include `customer`, `source`, or `purchase_order`.

Errors:

| Status | Message |
|---|---|
| 400 | `"At least one order item is required"`, `"An order cannot contain more than 50 items"`, `"Each order item must include a product id and quantity"`, `"Each product id must be a positive whole number"`, `"Duplicate product ids are not allowed"`, `"Quantity must be a positive whole number"`, `"Quantity is too large"`, `"Shipping address must be an object"`, `"Billing address must be an object"`, `"Shipping address is too large"`, `"Billing address is too large"`, `"Notes must be text"`, `"Notes must be 2000 characters or fewer"`, `"Payment method must be pay_later or cod"`, `"One or more products are inactive or do not exist"`, `"Insufficient stock for <product name>"`, `"Insufficient stock"` |
| 401 | `"Authentication required"` |
| 403 | Wrong role, or `"Account is inactive"` |
| 503 | `"Database is temporarily unavailable"` |
| 500 | `"Internal server error"` |

### `GET /api/orders/my`

Authentication: customer.

Query: `page`, `limit`, `status`, `search` (max 100), `from`, `to`.

`status` may be `pending`, `confirmed`, `processing`, `shipped`, `delivered`, or `cancelled`.

Response `200`:

```json
{
  "success": true,
  "data": {
    "orders": [],
    "total": 0,
    "page": 1,
    "limit": 10,
    "totalPages": 0,
    "counts": {
      "all": 0,
      "pending": 0,
      "confirmed": 0,
      "processing": 0,
      "shipped": 0,
      "delivered": 0,
      "cancelled": 0
    }
  }
}
```

Errors: `400` for an invalid page, limit, status, search, date, repeated filter, or a start date after the end date (`"The start date cannot be after the end date"`). `401`, `403`, `503`, `500` as on create.

### `GET /api/orders`

Authentication: admin.

Query: `page`, `limit`, `status`, `search`, `source` (`cart_checkout` or `purchase_order`), `from`, `to`.

Response `200` uses the same envelope as `/my`, and each order includes `customer`, `source`, and `purchase_order`. `counts` also includes global `cart_checkout` and `purchase_order` totals.

```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "21",
        "order_number": "BNC-ORD-000021",
        "user_id": "2",
        "subtotal": "4998.00",
        "tax_amount": "0.00",
        "shipping_charge": "0.00",
        "total_amount": "4998.00",
        "status": "pending",
        "payment_method": "cod",
        "payment_status": "pending",
        "shipping_address": {},
        "billing_address": {},
        "notes": null,
        "created_at": "2026-11-17T12:00:00.000Z",
        "updated_at": "2026-11-17T12:00:00.000Z",
        "items": [],
        "customer": {
          "id": "2",
          "name": "BNC Motors Customer",
          "email": "customer@bncmotors.com",
          "phone": "9845098765",
          "company_name": "Metro Auto Garage"
        },
        "source": "cart_checkout",
        "purchase_order": null
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "counts": {
      "all": 1,
      "pending": 1,
      "confirmed": 0,
      "processing": 0,
      "shipped": 0,
      "delivered": 0,
      "cancelled": 0,
      "cart_checkout": 1,
      "purchase_order": 0
    }
  }
}
```

An invalid `source` returns `400` `"Source filter is not valid"`.

### `GET /api/orders/:id`

Authentication: customer or admin. A customer receives only their own order. Another customer's order is `404` `"Order not found"`. A role other than `customer` or `admin` also receives that 404.

Response `200`: `{ "success": true, "data": { "order": {} } }`. The order includes `customer`, `source`, and `purchase_order`.

Errors: `400` `"A valid order id is required"`. `401` `"Authentication required"`. `404` `"Order not found"`.

### `PATCH /api/orders/:id/status`

Authentication: admin.

```json
{ "status": "confirmed" }
```

Response `200`: `{ "success": true, "message": "Order status updated", "data": { "order": {} } }`.

The returned order includes `customer`, `source`, and `purchase_order`.

Errors: `400` `"A valid order id is required"`, `"Status must be pending, confirmed, processing, shipped, delivered, or cancelled"`, or `"Cannot change an order from <current> to <requested>"`. `404` `"Order not found"`. `409` `"Stock could not be restored for this order"`.

## Purchase orders

A customer uploads one PDF. The API checks the extension, MIME type (`application/pdf` or `application/x-pdf`), size (10 MB), and the `%PDF-` header. `pdfjs-dist` reads at most 20 pages and 100,000 characters. The PDF file is not sent to Gemini. The configured provider receives the extracted text.

`PO_EXTRACTION_PROVIDER` defaults to `mock`. `gemini` calls Google Gemini when `GEMINI_API_KEY` and `GEMINI_MODEL` are set. `openai` is reserved and does not call OpenAI. Product ids and match scores from model output are ignored. `productMatchingService` compares each line with active catalogue products and may store `exact_sku`, `normalized_name` (score `0.9000`), or `fuzzy_name`. Suggestions are not approvals.

A successful upload is stored as `review_required`. The customer selects or rejects a catalogue product per line, then confirms. Confirm creates one order from the lines that are accepted and not yet converted, using catalogue prices and a locked stock check. One purchase order can create several orders. Each link is a row in `purchase_order_orders`, and each order id appears once. `purchase_orders.converted_order_id` is the latest order only.

The purchase order becomes `confirmed` only when every extracted line has `converted_order_id`. Rejected and still undecided lines keep that count above zero, so the status stays `partially_converted`. Gemini does not create the order and does not change stock.

Customers can read, download, review, and confirm only their own purchase orders. A request for someone else's id returns `404` `"Purchase order not found"`. Admins can list, read, and download every purchase order. Upload, match review, and confirm require the customer role.

The file route checks that the stored path stays under `server/uploads/purchase-orders` and that the file still starts with `%PDF-`. The response is `Content-Type: application/pdf` and `Content-Disposition: inline`. The private path is not returned. List and detail JSON do not include `file_path`.

Schema statuses are `uploaded`, `processing`, `review_required`, `partially_converted`, `confirmed`, and `failed`. The current upload handler writes `review_required` or `failed`. Confirm writes `partially_converted` or `confirmed`. `uploaded` and `processing` remain valid filter values.

Purchase-order numbers are `BNC-PO-` plus the id, padded to at least 6 digits.

List counts are totals by status for the caller (all rows for an admin, own rows for a customer). They do not follow search or date filters. Search matches purchase-order number, file name, customer name, email, company, or phone, and is at most 100 characters.

### `POST /api/purchase-orders/upload`

Authentication: customer.

```http
POST /api/purchase-orders/upload
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

file=<purchase-order.pdf>
```

The field name must be `file`.

Response `201` for mock extraction:

```json
{
  "success": true,
  "message": "Purchase order processed with mock extraction. Review the suggested product matches before creating an order.",
  "data": {
    "purchase_order": {
      "id": "14",
      "po_number": "BNC-PO-000014",
      "user_id": "2",
      "customer_name": "BNC Motors Customer",
      "customer_email": "customer@bncmotors.com",
      "customer_phone": "9845098765",
      "customer_company_name": "Metro Auto Garage",
      "file_name": "purchase-order.pdf",
      "file_type": "application/pdf",
      "file_size": "12000",
      "status": "review_required",
      "extracted_data": {},
      "processing_error": null,
      "processed_at": "2026-11-17T12:00:00.000Z",
      "converted_order_id": null,
      "converted_order_number": null,
      "created_at": "2026-11-17T12:00:00.000Z",
      "updated_at": "2026-11-17T12:00:00.000Z",
      "items": [],
      "orders": []
    },
    "extraction": {
      "provider": "mock",
      "mock": true,
      "notice": "Mock extraction only. This is test data from a deterministic text parser, not real AI processing."
    }
  }
}
```

A Gemini success uses message `"Purchase order processed. Review the suggested product matches before creating an order."`, `extraction.provider` `"gemini"`, `extraction.mock` false, and notice `"Extracted by Google Gemini from the PDF text. Review the suggested product matches before creating an order."`

Each item includes `id`, `line_number`, `extracted_name`, `extracted_sku`, `description`, `quantity`, `unit`, `unit_price`, `line_total`, `raw_extracted_data`, `converted_order_id`, `converted_quantity`, `converted_at`, `created_at`, and `matches`. A match includes `id`, `po_item_id`, `product_id`, `product_name`, `product_sku`, `match_score`, `match_status` (`suggested`, `accepted`, or `rejected`), `match_method`, `match_reason`, `is_selected`, `reviewed_by`, `reviewed_at`, and the catalogue fields `product_image_url`, `product_brand`, `product_category`, `product_description`, `product_unit`, `product_price`, `product_currency`, `product_stock_quantity`, `product_reorder_level`, `product_is_active`.

`extracted_data` on success stores the validated purchase order plus provider, mock flag, and notice. It does not store a catalogue product id chosen by the model.

Errors:

| Status | When |
|---|---|
| 400 | `"A PDF file is required"`, `"Only PDF files are allowed"`, `"PDF must be 10 MB or smaller"` |
| 401 | `"Authentication is required"` when the customer id cannot be read after upload. Middleware uses `"Authentication required"` when the header is missing |
| 403 | Customer role required |
| 422 | Text or validation failed and a `failed` purchase order was saved. Body includes `data.purchase_order` |
| 503 | Provider unavailable or unrecognized. The file is deleted and no row is saved |
| 500 / 503 | Unexpected failure, or database unavailable. An unsaved file is deleted |

422 messages include:

- `"This PDF has no extractable text. Scanned PDF OCR is not supported yet."`
- `"The PDF could not be read. No text was extracted."`
- `"The PDF text is too large to process."`
- `"Mock extraction could not find a complete purchase order in the PDF text. No AI request was made."`
- `"Gemini did not return a valid purchase order. No purchase order data was stored from the model output."`
- `"Extracted purchase order fields were invalid and were not stored."` and the matching `"Extracted field <name> is invalid."` messages

503 messages include a missing Gemini key, a missing model, an unknown provider, the disabled OpenAI provider, quota, an unavailable model, a rejected request, an authorization failure, and a Gemini network or server failure. Those messages say that no purchase order data was stored.

The mock parser expects lines in this shape: `PO Number`, `Supplier`, `Date` (`YYYY-MM-DD`), `Currency`, then `line | product | sku | quantity | unit | price`.

### `GET /api/purchase-orders`

Authentication: customer (own rows) or admin (all rows).

Query: `page`, `limit`, `status`, `search`, `from`, `to`.

Response `200`:

```json
{
  "success": true,
  "data": {
    "purchase_orders": [
      {
        "id": "14",
        "po_number": "BNC-PO-000014",
        "user_id": "2",
        "customer_name": "BNC Motors Customer",
        "customer_email": "customer@bncmotors.com",
        "customer_phone": "9845098765",
        "customer_company_name": "Metro Auto Garage",
        "file_name": "purchase-order.pdf",
        "file_type": "application/pdf",
        "file_size": "12000",
        "status": "review_required",
        "processing_error": null,
        "processed_at": "2026-11-17T12:00:00.000Z",
        "converted_order_id": null,
        "converted_order_number": null,
        "created_at": "2026-11-17T12:00:00.000Z",
        "updated_at": "2026-11-17T12:00:00.000Z",
        "item_count": 2,
        "accepted_count": 0,
        "rejected_count": 0,
        "pending_count": 2,
        "converted_count": 0,
        "accepted_quantity": 0,
        "converted_quantity": 0
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "counts": {
      "all": 1,
      "uploaded": 0,
      "processing": 0,
      "review_required": 1,
      "partially_converted": 0,
      "confirmed": 0,
      "failed": 0
    }
  }
}
```

Line counts: converted when `converted_order_id` is set; accepted when the line is not converted and exactly one match is selected and `accepted`; rejected when it is not converted, has no suggested matches, and has at least one rejected match; otherwise pending.

Errors: `400` for invalid paging, status, search, dates, or `"The start date cannot be after the end date"`. `403` when the token role is neither customer nor admin. `503` and `500` for database and unexpected failures.

### `GET /api/purchase-orders/:id`

Authentication: owner or admin.

Response `200`: `{ "success": true, "data": { "purchase_order": {} } }` with items, matches, and `orders`.

Each linked order has `id`, `order_number`, `status`, `subtotal`, `tax_amount`, `shipping_charge`, `total_amount`, `created_at`, `converted_line_count`, `converted_quantity`, and `item_quantity` (sum of `order_items.quantity`).

Errors: `400` `"Purchase order id must be a positive whole number"`. `403` for a role that is neither customer nor admin. `404` `"Purchase order not found"`.

### `GET /api/purchase-orders/:id/file`

Authentication: owner or admin.

Success `200` is the PDF stream. Headers include `Content-Type: application/pdf`, an inline filename, `X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-store`.

Errors: `400` for a bad id. `404` `"Purchase order not found"` or `"The original PDF is unavailable"`.

### `PATCH /api/purchase-orders/:id/items/:itemId/matches`

Authentication: customer, and only for a purchase order owned by that customer. Status must be `review_required` or `partially_converted`.

```json
{ "action": "select", "product_id": 1 }
```

`action` is `select` or `reject`. `product_id` is required for both. `select` accepts that active catalogue product for the line and leaves one selected match. `reject` marks that product rejected.

Response `200`:

```json
{
  "success": true,
  "message": "Product selected successfully.",
  "data": { "purchase_order": {} }
}
```

Reject message: `"Suggested product rejected. Please choose the correct catalogue product."`

Errors:

| Status | Message |
|---|---|
| 400 | `"Purchase order id must be a positive whole number"`, `"Purchase order item id must be a positive whole number"`, `"Action must be select or reject"`, `"Product id must be a positive whole number"`, `"This product is no longer available. Please choose another product."`, `"Purchase order item quantity is invalid"` |
| 404 | `"Purchase order not found"`, `"Purchase order item not found"`, `"Match not found"` |
| 409 | `"Purchase order cannot be reviewed"`, `"This line has already been converted"`, `"Only one product can be selected for this line"` |

### `POST /api/purchase-orders/:id/confirm`

Authentication: customer. The purchase order must belong to that customer and be `review_required` or `partially_converted`.

```json
{
  "shipping_address": { "line1": "12 Industrial Area", "city": "Bengaluru" },
  "billing_address": { "line1": "12 Industrial Area", "city": "Bengaluru" },
  "notes": "Converted from the uploaded purchase order"
}
```

All three fields are optional. Address and notes rules match order creation. Payment method is set to `pay_later` on the server.

Response `201` when every line is now converted:

```json
{
  "success": true,
  "message": "Purchase order confirmed and order created",
  "data": {
    "purchase_order": {},
    "order": {},
    "converted_line_count": 2,
    "remaining_line_count": 0
  }
}
```

When any line is still unconverted, the message is `"Matched items converted and order created"` and the purchase order status is `partially_converted`. `order` is the order created by this request. `purchase_order.orders` lists every linked order.

Errors:

| Status | Message |
|---|---|
| 400 | Bad id, address, or notes; `"Purchase order has no items to confirm"`; `"No accepted items are ready to convert."`; `"Quantity is too large"`; `"This product is no longer available. Please choose another product."`; insufficient-stock messages from order creation |
| 404 | `"Purchase order not found"` |
| 409 | `"Purchase order is already confirmed"`, `"Purchase order cannot be confirmed"`, `"Line <n> has more than one selected product"`, `"These matched items have already been converted"` |
| 403 | `"Account is inactive"` |

## Admin dashboard

### `GET /api/admin/dashboard/stats`

Authentication: admin.

Query: `range`. Allowed values are `7`, `30`, and `90`. Omitted or empty means 30. A repeated query value returns `400` `"Date range must be a single value"`. Any other value returns `400` `"Date range must be 7, 30, or 90 days"`.

Response `200` sets `Cache-Control: no-store`.

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalCustomers": 1,
      "activeProducts": 12,
      "totalOrders": 4,
      "pendingOrders": 1,
      "totalPurchaseOrders": 2,
      "partiallyConvertedPurchaseOrders": 0
    },
    "rangeDays": 30,
    "ordersTrend": [
      { "date": "2026-11-17", "count": 0 }
    ],
    "purchaseOrdersByStatus": [
      { "status": "uploaded", "count": 0 },
      { "status": "processing", "count": 0 },
      { "status": "review_required", "count": 1 },
      { "status": "partially_converted", "count": 0 },
      { "status": "confirmed", "count": 1 },
      { "status": "failed", "count": 0 }
    ],
    "recentOrders": [
      {
        "id": "21",
        "orderNumber": "BNC-ORD-000021",
        "customerName": "BNC Motors Customer",
        "itemCount": 1,
        "totalAmount": "4998.00",
        "currency": "INR",
        "status": "pending",
        "createdAt": "2026-11-17T12:00:00.000Z"
      }
    ],
    "recentPurchaseOrders": [
      {
        "id": "14",
        "poNumber": "BNC-PO-000014",
        "customerName": "BNC Motors Customer",
        "itemCount": 2,
        "convertedItemCount": 0,
        "status": "review_required",
        "createdAt": "2026-11-17T12:00:00.000Z"
      }
    ]
  }
}
```

`ordersTrend` has one point per day in the range. Recent lists contain at most 5 rows. Recent-order `currency` is always `"INR"` in this response. There is no `message` field.

Errors: `503` `"Database is temporarily unavailable"`. `500` `"Internal server error"`.

## Inventory

`GET /api/admin/inventory` lists products with a derived `stock_status`:

| Status | Rule |
|---|---|
| `inactive` | `is_active` is false |
| `out_of_stock` | active and `stock_quantity` is 0 |
| `low_stock` | active, quantity is greater than 0, and quantity is less than or equal to `reorder_level` |
| `in_stock` | active and quantity is greater than `reorder_level` |

Summary counts use those same rules and are not limited by the list filters. `alerts` are up to 8 active low-stock products, lowest quantity first. `categories` are the distinct nonempty category names.

Manual stock changes use `PATCH /api/products/:id/stock`. The body may contain only `type`, `quantity`, and `remarks`. `type` is `add` or `deduct`. `quantity` must be a JSON integer greater than 0 and at most `2147483647`. `remarks` is optional text, at most 500 characters. The update locks the product row, rejects a deduction below zero, rejects a result above the integer maximum, writes `stock_added` or `stock_deducted`, and commits both the quantity and the movement together.

Order and purchase-order movements are written in the order transaction, not by this route.

Movement types: `stock_added`, `stock_deducted`, `order_deduction`, `order_restoration`, `po_conversion_deduction`.

### `GET /api/admin/inventory`

Authentication: admin.

Query: `page`, `limit` (max 100), `search` (max 100; name, SKU, or brand), `category` (max 100), `stock_status` (`all`, `in_stock`, `low_stock`, `out_of_stock`, `inactive`). Default status is `all`.

Response `200`, `Cache-Control: no-store`:

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "1",
        "name": "Front Ceramic Brake Pad Set",
        "sku": "BNC-BP-FR-01",
        "image_url": null,
        "category": "Brakes",
        "brand": "Bosch",
        "unit": "set",
        "stock_quantity": 48,
        "reorder_level": 12,
        "is_active": true,
        "stock_status": "in_stock"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "summary": {
      "total_products": 12,
      "in_stock": 8,
      "low_stock": 2,
      "out_of_stock": 1,
      "last_adjustment_at": "2026-11-17T12:00:00.000Z"
    },
    "categories": ["Brakes", "Filters"],
    "alerts": []
  }
}
```

Errors: `400` `"Filters must be single values"`, page or limit errors, `"Search must be text"`, `"Search must be 100 characters or fewer"`, `"Category must be text"`, `"Category must be 100 characters or fewer"`, or `"Stock status must be all, in_stock, low_stock, out_of_stock, or inactive"`. `503` and `500` as on the dashboard.

### `GET /api/admin/inventory/movements`

Authentication: admin.

Query: `page`, `limit`, `movement_type`, `from`, `to`.

Response `200`:

```json
{
  "success": true,
  "data": {
    "movements": [
      {
        "id": "9",
        "product_id": "1",
        "product_name": "Front Ceramic Brake Pad Set",
        "sku": "BNC-BP-FR-01",
        "movement_type": "order_deduction",
        "previous_quantity": 48,
        "adjustment_quantity": 2,
        "new_quantity": 46,
        "remarks": "Stock deducted for order BNC-ORD-000021",
        "reference_type": "order",
        "reference_id": "21",
        "reference_number": "BNC-ORD-000021",
        "updated_by_name": "BNC Motors Customer",
        "created_at": "2026-11-17T12:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

`reference_number` is an order number when `reference_type` is `order`, a purchase-order number when it is `purchase_order`, and null otherwise. Manual adjustments do not set a related order.

Errors: `400` for repeated filters, paging errors, `"Movement type is not recognized"`, an invalid date, or `"Start date must be on or before the end date"`.

### `PATCH /api/products/:id/stock`

Authentication: admin.

```json
{
  "type": "add",
  "quantity": 5,
  "remarks": "Received from the warehouse"
}
```

Response `200`:

```json
{
  "success": true,
  "message": "Stock updated successfully",
  "data": {
    "product_id": "1",
    "previous_stock": 48,
    "adjustment": 5,
    "current_stock": 53,
    "type": "add"
  }
}
```

`type` in the response is the request type, `add` or `deduct`, not the stored movement name.

Errors:

| Status | Message |
|---|---|
| 400 | `"A valid product id is required"`, `"Stock update must include a type and quantity"`, `"Only type, quantity, and remarks can be submitted"`, `"Update type must be add or deduct"`, `"Quantity must be a positive whole number"`, `"Remarks must be text"`, `"Remarks must be 500 characters or fewer"` |
| 401 | `"Authentication required"` when the admin id cannot be read |
| 404 | `"Product not found"` |
| 409 | `"Deduction is greater than available stock"`, `"Stock quantity is too large"`, `"Stock changed before the update could be saved"`, `"Stock movement does not match the stock update"`, `"Stock could not be updated"` |
| 503 | `"Database is temporarily unavailable"` |
| 500 | `"Internal server error"` |

## Status reference

Order status is the fulfilment state of one order. Purchase-order status is the processing state of one uploaded document.

An order created from a cart and an order created from a purchase order both start as `pending`. Converting a purchase order does not set the new order to `confirmed`. An administrator moves the order through the transition table above.

A purchase order can remain `partially_converted` after an order has been created, because unconverted lines still exist. Its linked orders keep their own statuses.

## Error handling

Unknown paths:

```json
{
  "success": false,
  "message": "API route not found"
}
```

Status `404`.

Invalid JSON:

```json
{
  "success": false,
  "message": "Invalid JSON body"
}
```

Status `400`.

Unhandled exceptions:

```json
{
  "success": false,
  "message": "Internal server error"
}
```

Status `500`. The response does not include a stack trace.

| Status | Used for |
|---|---|
| 400 | Validation, illegal order transition, insufficient stock, bad PDF type or size |
| 401 | Missing or invalid token, unknown user on login or profile, bad credentials |
| 403 | Wrong role, inactive account |
| 404 | Missing product, order, purchase order, or PDF |
| 409 | Duplicate email or SKU, purchase order already confirmed or already converted, stock conflict |
| 422 | Purchase-order text or validation failure after the row is saved |
| 503 | Database connection failure on the handlers that check for it, or an extraction provider that is unavailable |
| 500 | Unexpected failure, missing `JWT_SECRET` at login, dashboard aggregate that fails its checks |

Product get, create, update, status, and delete do not map connection errors to 503. Their unexpected failures return 500.

## Security

- `authenticate` requires a bearer token and verifies it with `JWT_SECRET`. The payload must include `id` and `role`.
- `authorize` allows only the roles named on that route.
- Registration inserts `role` as `customer`.
- Passwords are hashed with bcrypt before insert. Login uses `bcrypt.compare`. Responses omit `password_hash`.
- SQL uses parameters rather than concatenated request values. `ILIKE` wildcards in search text are escaped.
- Order and purchase-order conversion read `products.price` inside the transaction. Request prices are not order prices.
- Stock deduction, restoration, purchase-order conversion, and manual adjustment run in a transaction. Order creation and manual adjustment lock product rows.
- PDF upload checks the name, MIME type, size, and file header. Download serves only a file that resolves inside the purchase-order upload directory and still looks like a PDF.
- `JWT_SECRET`, `DATABASE_URL`, and `GEMINI_API_KEY` belong in `server/.env`. That file is not part of the documented examples.

## Example workflows

### A. Register, log in, list products, place an order, read it

1. `POST /api/auth/register` with the registration body.
2. `POST /api/auth/login` and keep `data.token`.
3. `GET /api/products?search=filter&page=1&limit=10`.
4. `POST /api/orders` with the bearer token and `{ "items": [{ "product_id": 1, "quantity": 1 }], "payment_method": "pay_later" }`.
5. `GET /api/orders/<data.order.id>` with the same token.

The detail response includes `source: "cart_checkout"` and `purchase_order: null`.

### B. Upload a purchase order, review matches, confirm, read the linked order

1. Log in as a customer.
2. `POST /api/purchase-orders/upload` with multipart field `file`.
3. Read `data.purchase_order.items[].matches` from the `201` body, or call `GET /api/purchase-orders/<id>`.
4. For a line to accept:

```http
PATCH /api/purchase-orders/14/items/30/matches
Authorization: Bearer <jwt>
Content-Type: application/json

{ "action": "select", "product_id": 1 }
```

5. For a suggestion to reject:

```json
{ "action": "reject", "product_id": 1 }
```

6. `POST /api/purchase-orders/14/confirm` with optional shipping and billing objects.
7. `GET /api/orders/<data.order.id>`.

That order has `source: "purchase_order"` and `purchase_order.id` / `purchase_order.po_number`. `GET /api/purchase-orders/14` then lists the order in `orders`. A later confirm, after another line is accepted, creates another order and leaves the purchase order `partially_converted` until no unconverted lines remain.

`GET /api/purchase-orders/14/file` with the same token returns the PDF.

### C. Admin inventory adjustment

1. `POST /api/auth/login` as `admin@bncmotors.com`.
2. `GET /api/admin/inventory?stock_status=low_stock&page=1&limit=10`.
3. `PATCH /api/products/1/stock` with `{ "type": "add", "quantity": 5, "remarks": "Received from the warehouse" }`.
4. `GET /api/admin/inventory/movements?movement_type=stock_added&page=1&limit=10`.

The new movement type is `stock_added`. `previous_quantity`, `adjustment_quantity`, and `new_quantity` record the locked update.
