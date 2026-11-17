# BNC Motors AI-Powered Product Ordering System

BNC Motors is a spare-parts ordering application with two roles.

Customers browse the catalogue, keep a cart in the browser, and place orders. They can also upload a purchase-order PDF. The server extracts text from that PDF, asks the configured parser for structured lines, matches those lines to catalogue products, and lets the customer accept or reject each suggestion. Confirming accepted lines creates one or more orders and deducts stock.

Administrators manage products, inventory, customer orders, and uploaded purchase orders. Admin purchase-order pages are for monitoring. Matching and conversion stay with the customer who owns the file.

Prices charged on an order come from the product catalogue. The PDF price and the model output are not used as the order price. Stock changes run in the API, not in the browser.

## Customer order flow

1. Register or log in as a customer.
2. Search the catalogue and add products to the cart. The cart is stored in the browser under `bnc.cart.<user id>`.
3. Enter shipping details at checkout and review the order.
4. `POST /api/orders` checks stock, prices the lines from the catalogue, and saves the order in one database transaction.
5. The customer can open order history and order details.

Payment method is `pay_later` or `cod`. New orders are stored with payment status `pending`. Tax and shipping are stored on the order; the current calculation uses `0.00` for both because the schema has no rate table.

## Purchase-order flow

1. A customer uploads one PDF, up to 10 MB.
2. The API checks that the file is a PDF.
3. `pdfExtractionService` reads text with `pdfjs-dist`. The PDF file is not sent to Gemini.
4. `poAiExtractionService` turns that text into a purchase order. The provider is `mock` unless `PO_EXTRACTION_PROVIDER=gemini`.
5. The server validates `po_number`, `supplier_name`, `po_date`, `currency`, and line items. Product ids and match scores from the model are ignored.
6. `productMatchingService` compares each line with active catalogue products. It can suggest an exact SKU, a normalized name, or a fuzzy name. A suggestion is not an approval.
7. The customer selects or rejects matches.
8. `POST /api/purchase-orders/:id/confirm` converts the currently accepted, not-yet-converted lines into an order. Catalogue prices and a stock check run inside the order transaction. The movement type is `po_conversion_deduction`.

One purchase order can create more than one order. `purchase_order_orders` stores each link, and `order_id` is unique, so one order belongs to one purchase order. The purchase order becomes `confirmed` only when every extracted line has been converted. Rejected or still-undecided lines are not converted, so the purchase order remains `review_required` or `partially_converted`.

## Inventory

Administrators adjust stock with `PATCH /api/products/:id/stock` (`add` or `deduct`). Product edit does not change stock: a different `stock_quantity` on `PUT /api/products/:id` is rejected. Customer orders, cancellations, and purchase-order conversions write `inventory_movements` in the same transaction as the stock change. Cancellation restores stock once.

Creating a product can set an opening `stock_quantity`. That create request does not write an inventory movement.

## Technology stack

| Area | What the repository uses |
|---|---|
| Frontend | React 19, React DOM, React Router 7, Vite 8 |
| Backend | Node.js, Express 5, CommonJS |
| Database | PostgreSQL through `pg` |
| Auth | `jsonwebtoken` (1-day token with `id` and `role`), `bcrypt` |
| AI | `@google/genai`, only when the provider is `gemini` |
| PDF text | `pdfjs-dist` 3.11.174 |
| Uploads | `multer` |
| HTTP security | `helmet`, `cors` |
| Config | `dotenv` |
| Phone and location | `libphonenumber-js`, `world-country-state-district`, `country-flag-icons` (client) |
| Development | `nodemon` for the API, ESLint and `@vitejs/plugin-react` for the client |

`package.json` does not declare an `engines` field, so this README does not state a minimum Node.js or PostgreSQL version. The SQL uses identity columns, `jsonb`, and partial unique indexes.

## Project structure

```text
bnc-motors/
  client/                 React application
    src/api/              API clients
    src/pages/            Customer and admin screens
    src/pages/admin/      Admin screens
    src/components/       Shared, customer, and admin components
    src/styles/           CSS
  server/
    src/server.js         Process entry; loads .env and listens
    src/app.js            Express app and route mounting
    src/routes/           HTTP routes
    src/controllers/      Request handling
    src/models/           SQL
    src/services/         PDF text, extraction, and product matching
    src/middleware/       JWT auth and role checks
    src/config/db.js      PostgreSQL pool
    uploads/purchase-orders/  Stored PDFs (not public)
    samples/              Sample PDF files
    scripts/testGeminiExtraction.js
  database/
    schema.sql            Full schema for a new database
    seed.sql              Demo users, products, orders, and stock movements
    migrations/           Changes for a database created before schema.sql
```

The Vite dev server proxies `/api` to `http://localhost:5000`.

## Prerequisites

- Node.js and npm
- PostgreSQL
- A Google Gemini API key, only if you set `PO_EXTRACTION_PROVIDER=gemini`

Local development works with `PO_EXTRACTION_PROVIDER=mock` and no Gemini key.

## Installation and setup

There is no root `package.json`. Install and start the client and server separately. Create the database yourself, then apply `database/schema.sql` and `database/seed.sql`. Starting the API does not load or repeat the seed.

1. Clone or download this repository.
2. Install frontend dependencies:

   ```bash
   cd client
   npm install
   ```

3. Install backend dependencies:

   ```bash
   cd server
   npm install
   ```

4. Create a PostgreSQL database. The name below is an example; use the same name in `DATABASE_URL`. The setup commands do not create the database.

   ```bash
   createdb bnc_motors
   ```

5. Create `server/.env` from `server/.env.example`. Set `DATABASE_URL` and `JWT_SECRET`. Leave the provider as `mock` until you want a live Gemini call. Restart the API after any `.env` change.

6. Frontend environment is optional. With nothing set, the Vite proxy is used. Create `client/.env` from `client/.env.example` only when the API is on another origin, and set `VITE_API_URL`.

7. Initialize a fresh database with one of the two approaches below. Use only one. Do not run both on the same database.

   **Option A — manual setup**

   ```bash
   psql -d bnc_motors -f database/schema.sql
   psql -d bnc_motors -f database/seed.sql
   ```

   `schema.sql` stops if its tables already exist. `seed.sql` can be run again: existing emails, SKUs, demo order numbers, and demo stock movements are left unchanged, and stock already stored for a SKU is not reduced again.

   **Option B — automated setup**

   From `server`, with `DATABASE_URL` pointing at the empty database:

   ```bash
   npm run db:setup
   ```

   This applies `database/schema.sql` and `database/seed.sql` in one transaction. If either file fails, the transaction rolls back and the database stays empty. The command is for a database with no tables, views, sequences, or indexes in `public`. If it finds any, it stops without dropping or changing them.

   An existing database should not use `schema.sql` or `db:setup`. Apply the migrations in this order:

   ```bash
   psql -d bnc_motors -f database/migrations/001_complete_database_design.sql
   psql -d bnc_motors -f database/migrations/002_user_location.sql
   psql -d bnc_motors -f database/migrations/003_partial_purchase_order_conversion.sql
   psql -d bnc_motors -f database/migrations/004_order_payment.sql
   psql -d bnc_motors -f database/migrations/005_inventory_movements.sql
   psql -d bnc_motors -f database/migrations/006_inventory_movement_history.sql
   ```

   `schema.sql` already includes the end state of those migrations. A database created from `schema.sql` or `db:setup` does not need them. After the migrations, `seed.sql` can load the demo rows.

8. Start the API from `server`:

   ```bash
   npm run dev
   ```

   This runs `nodemon src/server.js`. `npm start` runs `node src/server.js` without reload. The default port is `5000`.

9. Start the frontend from `client`:

    ```bash
    npm run dev
    ```

    Open the URL Vite prints. The usual dev URL is `http://localhost:5173`.

## Environment variables

Create the `.env` files yourself. Do not commit `server/.env`. `.gitignore` ignores `.env` and keeps `.env.example`.

| Variable | Purpose | Example |
|---|---|---|
| `PORT` | API port. `5000` when omitted. | `5000` |
| `CLIENT_URL` | Browser origin allowed by CORS. Defaults to `http://localhost:5173`. | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string for the `pg` pool. Required for database routes. | `postgresql://USER:PASSWORD@localhost:5432/bnc_motors` |
| `JWT_SECRET` | Signs login tokens. Login returns an error when this is missing. | `replace-with-a-long-random-string` |
| `PO_EXTRACTION_PROVIDER` | `mock` or `gemini`. Omitted means `mock`. `openai` is reserved and does not call OpenAI. | `mock` |
| `GEMINI_API_KEY` | Google Gemini API key. Required only for `gemini`. | `your-gemini-api-key` |
| `GEMINI_MODEL` | Gemini model id enabled for that key. The server does not substitute a model. | `your-gemini-model-id` |
| `VITE_API_URL` | Optional client API origin. Unset uses the Vite `/api` proxy. | `http://localhost:5000` |

`GEMINI_MODEL` must be a model your key can call. This README does not name one.

## Sample login credentials

These are local development accounts inserted by `database/seed.sql`. The SQL file stores bcrypt hashes only. The passwords below match those hashes.

| Role | Email | Password | Seeded company |
|---|---|---|---|
| Admin | `admin@bncmotors.com` | `BncAdmin#2026` | BNC Motors |
| Customer | `customer@bncmotors.com` | `BncCustomer#2026` | Metro Auto Garage |
| Customer | `customer2@bncmotors.com` | `BncCustomer2#2026` | Harbour Line Motors |

Registration always creates a `customer`. It cannot create an admin. Seed inserts the admin directly.

## Demo catalogue and transactions

A fresh `seed.sql` load inserts 13 products. Twelve are active. `BNC-BLB-H4` is inactive and does not appear in the customer catalogue. Prices are INR.

| SKU | Product | Category | Stock | Reorder |
|---|---|---|---|---|
| `BNC-BP-FR-01` | Front Ceramic Brake Pad Set | Brakes | 48 | 12 |
| `BNC-OF-220` | Spin-On Engine Oil Filter | Filters | 150 | 40 |
| `BNC-SP-IR4` | Iridium Spark Plug Set | Ignition | 86 | 20 |
| `BNC-AF-310` | Panel Engine Air Filter | Filters | 72 | 24 |
| `BNC-ALT-90A` | 12V 90A Alternator | Electrical | 14 | 4 |
| `BNC-RAD-AL16` | Aluminum Radiator Assembly | Cooling | 9 | 3 |
| `BNC-CK-240` | Clutch Kit with Release Bearing | Transmission | 16 | 4 |
| `BNC-SH-RR-01` | Rear Gas Shock Absorber | Suspension | 28 | 8 |
| `BNC-TB-118` | Timing Belt Kit | Engine | 18 | 5 |
| `BNC-HL-LH-01` | Left Headlamp Assembly | Lighting | 11 | 3 |
| `BNC-CF-118` | Cabin Pollen Filter | Filters | 3 | 8 |
| `BNC-WB-24` | Frame Wiper Blade 24 inch | Wipers | 0 | 6 |
| `BNC-BLB-H4` | H4 Halogen Headlamp Bulb | Lighting | 40, inactive | 10 |

`BNC-CF-118` is low stock. `BNC-WB-24` is out of stock. Those two products have no demo orders. The stock figures above are the quantities after the demo sales. The seed writes the movement history and does not subtract those quantities a second time.

| Order | Customer | Status | Payment | Contents |
|---|---|---|---|---|
| `BNC-ORD-DEMO-0001` | `customer@bncmotors.com` | delivered | `pay_later`, pending | 2 brake-pad sets and 4 oil filters. Total 6394.00 |
| `BNC-ORD-DEMO-0002` | `customer@bncmotors.com` | pending | `cod`, pending | 2 rear shocks and 1 air filter. Total 6899.00 |
| `BNC-ORD-DEMO-0003` | `customer2@bncmotors.com` | shipped | `pay_later`, pending | 1 spark-plug set and 1 clutch kit. Total 8789.00 |
| `BNC-ORD-DEMO-0004` | `customer2@bncmotors.com` | confirmed | `cod`, pending | 1 alternator and 1 headlamp. Total 13790.00 |
| `BNC-ORD-DEMO-0005` | `customer2@bncmotors.com` | cancelled | `pay_later`, pending | 1 timing-belt kit. Total 4560.00. Stock was deducted and then restored |

Tax and shipping on these orders are `0.00`. Each customer sees only that customer's orders. The admin order list includes all five. Fulfilled lines have an `order_deduction` movement whose `new_quantity` matches the product's current stock. The cancelled timing-belt line also has an `order_restoration` movement back to stock 18.

Purchase orders are not part of the seed. `file_path` has to point at a real file under `server/uploads/purchase-orders`, and the sample PDFs in `server/samples` are not stored there. To try extraction, log in as a customer and upload a text PDF. With `PO_EXTRACTION_PROVIDER` omitted or set to `mock`, the PDF text must use the mock line layout described in Limitations.

## Application features

### Customer

- Registration and login. The token is kept in `localStorage` as `bnc.auth.token` and expires after one day.
- Product catalogue, search, category filter, and product details.
- Cart and checkout, including review before the order is placed.
- Order history and order details.
- Purchase-order PDF upload.
- Text extraction and catalogue matching.
- Accepting or rejecting a suggested match, and choosing another catalogue product where the review API allows `select`.
- Partial and full conversion of accepted lines into orders.

### Admin

- Dashboard at `/admin`, with a `7`, `30`, or `90` day range. The default range is 30 days.
- Product list, create, edit, activate or deactivate. Delete sets `is_active` to false.
- Inventory levels, manual stock changes, movement history, and a browser-side CSV export of the current inventory view.
- Orders list and order details, with status changes allowed by the server transition rules.
- Cart Checkout and Purchase Order shown as separate order sources. The source is the `purchase_order_orders` link, not the order-number text.
- Purchase-order list and detail, including status counts, conversion progress, PDF preview and download, extracted lines, and every linked order.

Admin purchase-order screens do not upload a PDF, call Gemini again, accept matches, or convert lines.

### Limitations

- Scanned PDFs have no text layer. The API returns: “This PDF has no extractable text. Scanned PDF OCR is not supported yet.”
- Text stored as separate words on one line can be joined without spaces, so some otherwise valid PDFs fail extraction.
- PDF text extraction reads at most 20 pages and 100,000 characters.
- The mock parser only understands this layout: `PO Number`, `Supplier`, `Date` (`YYYY-MM-DD`), `Currency`, then `line | product | sku | quantity | unit | price`.
- A missing Gemini key, a missing model, an unknown provider, quota, or a network failure stops the upload and does not save a purchase order.
- Unreadable PDF text or model output that fails validation is stored as a `failed` purchase order and the upload responds with HTTP 422.
- Gemini can misread a document. A person must review matches before an order is created.
- The model does not create orders and does not change stock.

## AI integration workflow

1. The customer sends `multipart/form-data` with one field, `file`.
2. The API allows only a `.pdf` file whose MIME type is `application/pdf` or `application/x-pdf`, and whose bytes start with `%PDF-`.
3. `pdfjs-dist` extracts text on the server.
4. With `gemini`, that text is sent to Google Gemini for structured JSON. With `mock`, a fixed parser runs and no Gemini request is made.
5. `validatePurchaseOrder` checks the structured fields. Invalid output is not treated as catalogue data.
6. The matching service compares extracted lines with active products and stores suggestions in `po_matches`.
7. The customer reviews each line with `select` or `reject`.
8. Confirm builds the order from accepted lines, using catalogue prices, inside a transaction that locks products and deducts stock.

## API

Send `Authorization: Bearer <token>` where authentication is required. Responses use `{ success, message, data }`.

### Health and auth

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | API status and timestamp. |
| `POST` | `/api/auth/register` | Public | Create a customer. Body: `name`, `email`, `password`, `phone`, `company_name`, `country`, `country_code`, `state`, and `district` when that state has districts. Password length is 8 to 72. |
| `POST` | `/api/auth/login` | Public | Body: `email`, `password`. Returns a token and the user. |
| `GET` | `/api/auth/me` | Any logged-in user | Current profile. |

### Products

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/products` | Public for active products | Query: `page`, `limit` (max 100), `search`, `category`, `status`. `status` `inactive` or `all` requires an admin token. |
| `GET` | `/api/products/:id` | Public for an active product | Admins can also read an inactive product. |
| `GET` | `/api/products/:id/related` | Public | Query: `limit` (max 4). |
| `POST` | `/api/products` | Admin | Create. Required: `name`, `sku`, `price`. Optional: `description`, `stock_quantity`, `reorder_level`, `category`, `brand`, `image_url`, `unit`, `currency`. |
| `PUT` | `/api/products/:id` | Admin | Update allowed product fields. A changed `stock_quantity` is rejected. |
| `PATCH` | `/api/products/:id/status` | Admin | Body: `{ "is_active": true }` or `{ "is_active": false }`. |
| `PATCH` | `/api/products/:id/stock` | Admin | Body: `type` (`add` or `deduct`), `quantity` (positive integer), optional `remarks`. |
| `DELETE` | `/api/products/:id` | Admin | Soft delete (`is_active` false). |

### Orders

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/orders` | Customer | Body: `items` (`product_id`, `quantity`), optional `shipping_address`, `billing_address`, `notes`, `payment_method` (`pay_later` or `cod`). |
| `GET` | `/api/orders/my` | Customer | Own orders. Query: `page`, `limit`, `status`, `search`, `from`, `to`. |
| `GET` | `/api/orders` | Admin | All orders. Same query fields, plus `source` (`cart_checkout` or `purchase_order`). Includes global status and source counts. |
| `GET` | `/api/orders/:id` | Customer or admin | Own order, or any order for an admin. |
| `PATCH` | `/api/orders/:id/status` | Admin | Body: `{ "status": "..." }`. Allowed moves: pending to confirmed or cancelled; confirmed to processing or cancelled; processing to shipped or cancelled; shipped to delivered. Delivered and cancelled do not move. |

`from` and `to` are `YYYY-MM-DD`. `from` cannot be after `to`.

### Purchase orders

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/purchase-orders/upload` | Customer | Multipart field `file`. |
| `GET` | `/api/purchase-orders` | Customer or admin | Customer sees own rows. Admin sees all. Query: `page`, `limit`, `status`, `search`, `from`, `to`. Includes global status counts. |
| `GET` | `/api/purchase-orders/:id` | Customer or admin | Own purchase order, or any for an admin. Includes items, matches, and linked orders. |
| `GET` | `/api/purchase-orders/:id/file` | Customer or admin | PDF bytes for that owner, or any file for an admin. Private path is not returned. |
| `PATCH` | `/api/purchase-orders/:id/items/:itemId/matches` | Customer | Body: `action` (`select` or `reject`) and `product_id`. |
| `POST` | `/api/purchase-orders/:id/confirm` | Customer | Body: optional `shipping_address`, `billing_address`, `notes`. Converts currently accepted lines. |

Purchase-order statuses: `uploaded`, `processing`, `review_required`, `partially_converted`, `confirmed`, `failed`.

### Admin dashboard and inventory

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/dashboard/stats` | Admin | Query: `range` of `7`, `30`, or `90`. |
| `GET` | `/api/admin/inventory` | Admin | Query: `page`, `limit`, `search`, `category`, `stock_status` (`all`, `in_stock`, `low_stock`, `out_of_stock`, `inactive`). |
| `GET` | `/api/admin/inventory/movements` | Admin | Query: `page`, `limit`, `movement_type`, `from`, `to`. Movement types: `stock_added`, `stock_deducted`, `order_deduction`, `order_restoration`, `po_conversion_deduction`. |

## Database

| Table | Role |
|---|---|
| `users` | Accounts. `role` is `customer` or `admin`. |
| `products` | Catalogue, price, stock, and reorder level. |
| `orders` | Order header, totals, status, payment method, and payment status. |
| `order_items` | Lines saved with the catalogue name, SKU, and unit price from the time of the order. |
| `purchase_orders` | Uploaded document metadata, status, extracted JSON, and the latest converted order id. `file_path` stays on the server. |
| `po_items` | Extracted lines, plus `converted_order_id`, `converted_quantity`, and `converted_at` after conversion. |
| `po_matches` | Suggested or reviewed catalogue matches. Status is `suggested`, `accepted`, or `rejected`. |
| `purchase_order_orders` | Every order created from a purchase order. One order id can appear once. |
| `inventory_movements` | Stock history for manual changes, orders, cancellations, and purchase-order conversion. |

`orders.user_id` and `purchase_orders.user_id` reference `users`. `order_items` reference `orders` and `products`. `po_items` reference `purchase_orders`. `po_matches` reference `po_items` and `products`. A partial unique index on `inventory_movements (product_id, adjustment_type, related_order_id)` applies when `related_order_id` is set, so the same order movement is not recorded twice for one product.

`purchase_orders.converted_order_id` points at the latest order created from that purchase order. It is not the full list. Use `purchase_order_orders` for every linked order.

## Security and business rules

- Passwords are hashed with bcrypt before insert. Seed passwords are stored as hashes.
- Login issues a JWT signed with `JWT_SECRET`. Routes that need a user read `Authorization: Bearer`.
- `authorize` limits routes to `customer` or `admin`.
- Registration inserts `role` as `customer` only.
- SQL uses parameterized queries.
- Order and purchase-order conversion ignore client prices and read the catalogue price on the server.
- Stock deduction and purchase-order conversion run in a transaction with row locks.
- Cancelling an order restores the deducted stock once. A second cancel does not restore it again.
- PDF download checks the owner unless the caller is an admin, and only serves a file stored under `server/uploads/purchase-orders`.
- Keep `JWT_SECRET`, `DATABASE_URL`, and `GEMINI_API_KEY` in `server/.env`, not in source.

## Scripts

From `client`:

| Script | Command |
|---|---|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| Preview the build | `npm run preview` |

From `server`:

| Script | Command |
|---|---|
| Dev server with reload | `npm run dev` |
| Start without reload | `npm start` |
| Apply schema and seed to an empty database | `npm run db:setup` |
| `npm test` | Prints `Error: no test specified` and exits 1. It is not an application test suite. |

`node scripts/testGeminiExtraction.js`, run from `server`, exercises the extraction service. It is not wired to `npm test`.

## Troubleshooting

**PostgreSQL connection failures.** `server/src/config/db.js` connects with `DATABASE_URL` only. Check that PostgreSQL is running, the database exists, and the user in the URL can connect. The pool uses a 3 second connection timeout and at most 5 clients.

**Missing environment variables.** Start the API from `server` so `dotenv` loads `server/.env`. Login fails closed when `JWT_SECRET` is missing. `gemini` fails closed when `GEMINI_API_KEY` or `GEMINI_MODEL` is missing, and that failure does not save a purchase order.

**Gemini.** Keep `PO_EXTRACTION_PROVIDER=mock` until the key and model are set. Restart the API after changing them. The PDF itself is not uploaded to Gemini.

**Port conflicts.** The API uses `PORT` or `5000`. Vite’s default dev port is `5173`, and its proxy target is `http://localhost:5000`. Change `PORT` and the proxy together if you move the API.

**Migration errors.** Do not run `schema.sql` when the tables already exist. On an existing database, run `001` through `006` in order. `schema.sql` is the file for an empty database.

**PDF extraction failures.** Scanned documents are not read. The mock parser rejects text that does not match its line layout. A `failed` purchase order means the file was saved and extraction or validation did not produce a usable purchase order. Check `processing_error` on that row.
