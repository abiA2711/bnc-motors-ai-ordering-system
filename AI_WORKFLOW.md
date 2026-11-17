# BNC Motors purchase-order workflow

Customers can place an order from the catalogue cart, or they can upload a purchase-order PDF. The PDF path exists because a customer’s document does not use the catalogue’s product ids, prices, or stock. The server reads the text, asks a configured extractor for structured lines, and then matches those lines to active catalogue products. A person reviews every suggestion. The order and the stock change happen only after that review, in the purchase-order confirmation transaction.

Gemini, when enabled, reads extracted text and returns purchase-order fields. It does not choose the catalogue product that will be sold, and it does not create the order.

## End-to-end workflow

1. A logged-in customer sends `POST /api/purchase-orders/upload` with one multipart field named `file`. The route allows the customer role only.
2. Multer accepts a single `.pdf` whose MIME type is `application/pdf` or `application/x-pdf`, up to 10 MB. The controller reads the saved file and requires the bytes to start with `%PDF-`.
3. `pdfExtractionService` loads the file with `pdfjs-dist` (`legacy/build/pdf.js`), with the worker disabled and `isEvalSupported: false`. It reads at most 20 pages, joins text items into lines, strips null characters, and rejects empty text or text longer than 100,000 characters.
4. `extractPurchaseOrder` sends that text to the provider named by `PO_EXTRACTION_PROVIDER`. If the variable is omitted, the provider is `mock`.
5. The provider returns `po_number`, `supplier_name`, `po_date`, `currency`, and line items. `validatePurchaseOrder` checks those fields again before anything is stored.
6. On success, `savePurchaseOrder` stores the purchase order as `review_required`, inserts `po_items`, and calls `productMatchingService` against active products only. Each suggestion is inserted into `po_matches` with `match_status` `suggested` and `is_selected` false.
7. The customer calls `PATCH /api/purchase-orders/:id/items/:itemId/matches` with `select` or `reject` and a `product_id`. This is allowed only for that customer’s purchase order, and only while the status is `review_required` or `partially_converted`.
8. `POST /api/purchase-orders/:id/confirm` loads lines that have exactly one selected `accepted` match and no `converted_order_id`. It creates one order through `createOrderInTransaction`, using catalogue prices and a locked stock check. The movement type is `po_conversion_deduction`.

A text or validation failure still saves a purchase order, with status `failed`, `processing_error` set, and HTTP 422. A missing provider, an unknown provider, or a Gemini configuration or availability failure deletes the uploaded file and saves no row. That response is HTTP 503.

The stored purchase-order number is `BNC-PO-` plus the database id, padded to at least six digits. The number printed on the PDF is kept inside `extracted_data`; it is not used as the primary key.

## AI provider configuration

Set these variables in `server/.env`. Do not put a real API key in source or in this document.

| Variable | Behaviour |
|---|---|
| `PO_EXTRACTION_PROVIDER` | `mock`, `gemini`, or the reserved name `openai`. Omitted or blank becomes `mock`. Any other value is rejected before a request is made. |
| `GEMINI_API_KEY` | Required only when the provider is `gemini`. |
| `GEMINI_MODEL` | Required only when the provider is `gemini`. The server does not substitute a model id. |

### Mock

`extractWithMockProvider` is a deterministic text parser. It makes no network request. Its notice is: “Mock extraction only. This is test data from a deterministic text parser, not real AI processing.”

Every non-empty line must match one of these patterns:

```text
PO Number: <value>
Supplier: <value>
Date: YYYY-MM-DD
Currency: INR
1 | Product name | SKU | 2 | pcs | 2499.00
```

`PO Number`, `Supplier`, `Date`, and `Currency` are case-insensitive labels. Currency is stored in uppercase. A line that matches none of the patterns fails the whole document. A document that is missing any header, or that has no item line, also fails. After the parse, the same `validatePurchaseOrder` rules used for Gemini apply.

### Gemini

`extractWithGeminiProvider` checks `GEMINI_API_KEY` and `GEMINI_MODEL`, then calls `@google/genai` `generateContent`. The request sends the extracted text, `temperature: 0`, `responseMimeType: application/json`, and a response schema. The schema allows only `po_number`, `supplier_name`, `po_date`, `currency`, and items with `line_number`, `product_name`, `sku`, `quantity`, `unit`, and `unit_price`. The prompt tells the model to use only printed facts and not to return catalogue product ids or match scores.

`normalizeGeminiPurchaseOrder` keeps those validated fields and drops anything else. The PDF file is not uploaded.

Gemini HTTP failures are mapped before a purchase order is saved:

| Provider status | Result |
|---|---|
| 429 | Quota exceeded |
| 404 | Configured model is not available |
| 400 | Request rejected |
| 401 or 403 | Extraction is not authorized |
| 500 or higher | Service temporarily unavailable |
| No status | Service could not be reached |

A missing key, a missing model, or a failure to load `@google/genai` uses the same unavailable path: the file is removed and no purchase order is stored. Invalid JSON or fields that fail validation are different. Those are document failures, so the API saves a `failed` purchase order and returns 422.

The Gemini notice stored on success is: “Extracted by Google Gemini from the PDF text. Review the suggested product matches before creating an order.”

### OpenAI

`extractWithOpenAiProvider` does not call OpenAI. Selecting `openai` throws immediately: “The OpenAI extraction provider is not enabled. No OpenAI request was made.” The upload is rejected with 503 and no row is saved.

## Product matching

Matching runs in the server after extraction. The catalogue query is `id`, `name`, and `sku` for rows with `is_active = true`.

`matchLine` tries three methods, in order, and stops when an earlier method matches:

1. **Exact SKU.** If the extracted line has a SKU, it is trimmed and compared case-insensitively with `products.sku`. One match is returned with score `1.0000`, method `exact_sku`, and a reason that says the row is a suggestion and review is required.
2. **Normalized name.** Used when the SKU is missing or not in the catalogue. The name is lowercased, and characters outside `a-z` and `0-9` become spaces. An equal normalized catalogue name returns one match with score `0.9000` and method `normalized_name`.
3. **Fuzzy name.** Used when neither of the above matches. The server computes Levenshtein similarity on the normalized names. Names longer than 120 characters are treated as dissimilar. Scores below `0.55` are dropped. At most three products are returned, highest score first. The stored fuzzy score is capped at `0.8900`, so it stays below the normalized-name score. The method is `fuzzy_name`, and the reason says the row is a suggestion, not an approval.

Suggestions are written with `is_selected` false. A suggestion does not put the line on an order.

Customer review is a separate transaction:

- `reject` marks that existing `po_matches` row `rejected`, clears `is_selected`, and records `reviewed_by` and `reviewed_at`. Rejecting a product id that was never suggested returns 404.
- `select` requires the product to be active. It clears any other selected match on that line, then inserts or updates the chosen product as `match_status` `accepted`, `match_method` `manual` for a new row, and `is_selected` true. The customer can select a catalogue product that the matcher did not suggest. The manual score is null.
- A line that already has `converted_order_id` cannot be reviewed.
- Confirm later requires exactly one selected `accepted` match on a line. Extra selected matches are rejected.

Model output is not a source of catalogue identity. The Gemini schema and normalizer have no product-id or match-score field. The matching service assigns its own scores. Confirmation reads `products.id` from the accepted `po_matches` row and reads `products.price` from the locked catalogue row.

## Order creation and inventory safety

`confirmPurchaseOrder` locks the purchase order and its lines. It keeps lines that are not yet converted and have exactly one selected, accepted, active product. Quantities for the same product on several lines are added together. The combined quantity cannot exceed 100,000.

That item list is passed to `createOrderInTransaction` inside the same database transaction:

- The customer account must still be active.
- Matching products are loaded with `SELECT ... FOR UPDATE`.
- An inactive or missing product stops the confirmation.
- A quantity above `stock_quantity` stops the confirmation. No stock is changed.
- `order_items.unit_price` is `products.price`. The PDF `unit_price` stored on `po_items` is not the order price. Tax and shipping in this transaction are `0.00`.
- Payment method is `pay_later` and payment status is `pending`. The new order status is `pending`.
- Stock is reduced with a conditional update that requires `stock_quantity >= quantity`.
- `inventory_movements` records `po_conversion_deduction`, with `reference_type` `purchase_order`, `reference_id` set to the purchase order, and `related_order_id` set to the new order.

If the order insert succeeds, the converted lines get `converted_order_id`, `converted_quantity` equal to the line quantity, and `converted_at`. One row is inserted into `purchase_order_orders`. `order_id` on that table is unique, so one order belongs to one purchase order. `purchase_orders.converted_order_id` is updated to this latest order.

The next purchase-order status is `confirmed` only when no `po_items` row still has a null `converted_order_id`. Otherwise it is `partially_converted`. Rejected and undecided lines count as remaining lines, so they keep the purchase order out of `confirmed`. A later confirm, after more lines are accepted, creates another order. Calling confirm when every accepted line is already converted returns 409.

Cancellation of the resulting order is a separate admin order-status change. That path restores stock and writes `order_restoration`. Purchase-order confirmation does not do that.

## Security and validation

Upload checks:

- Customer authentication and the customer role.
- One file, `.pdf` extension, PDF MIME type, and a 10 MB limit.
- A `%PDF-` header before extraction, and the same header check inside `extractPdfText`.
- Stored files use a random hex name under `server/uploads/purchase-orders`. The public purchase-order JSON does not include `file_path`.

Download checks the caller, resolves the path, and serves the file only when it stays inside that upload directory and still starts with `%PDF-`. A customer can download only their own file. An admin can download any stored purchase order. Review and confirm stay on the customer route and use the caller’s user id as the owner.

`validatePurchaseOrder` requires:

- `po_number`: 1 to 40 characters, starting with a letter or digit, then letters, digits, `.`, `_`, `/`, or `-`.
- `supplier_name`: 1 to 150 characters.
- `po_date`: a real `YYYY-MM-DD` date.
- `currency`: three letters.
- 1 to 50 items, with unique `line_number` values from 1 to 10000.
- `product_name`: 1 to 255 characters.
- `sku`: omitted, or 1 to 100 characters in the same character set as the purchase-order number.
- `quantity`: integer from 1 to 100000.
- `unit`: omitted, or 1 to 20 letters.
- `unit_price`: a nonnegative amount with up to 2 decimal places, at most 10 digits before the decimal point.

Provider failure handling:

- `PROVIDER_UNAVAILABLE` and `PROVIDER_UNKNOWN`: HTTP 503, uploaded file deleted, no purchase-order row.
- `PDF_NO_TEXT`, `PDF_READ_FAILED`, `PDF_TEXT_TOO_LARGE`, `PARSE_FAILED`, and `VALIDATION`: HTTP 422, purchase order saved as `failed` with `processing_error`.
- Any other exception before that save removes the uploaded file. Database connection failures on the save return 503. Other unexpected failures return 500.

## Limitations

- Scanned PDFs have no text layer. The API returns: “This PDF has no extractable text. Scanned PDF OCR is not supported yet.”
- Text items on the same PDF line are concatenated. If the next item has no leading space and the vertical position changes by 2 points or less, words can be joined without a space. That can make an otherwise readable PDF fail the mock parser or change a Gemini line.
- Pages after page 20 are not read. Extracted text over 100,000 characters is rejected.
- The mock parser accepts only the header and pipe-delimited line format above. Extra lines fail the document.
- Gemini runs only with a key, a model id, a loadable `@google/genai` package, and a successful Gemini response. The server does not retry and does not switch back to mock when Gemini fails.
- OpenAI is a reserved provider name. No OpenAI request is implemented.
- Fuzzy matching compares normalized names only. It does not use brand, category, or description. It returns at most three suggestions, and only when similarity is at least `0.55`.
- Extracted prices are stored for display and audit. They are not the prices charged on the order.
- A purchase order with any unconverted line, including a rejected or undecided line, remains `review_required` or `partially_converted`.
- `schema.sql` and migration `001_complete_database_design.sql` both create `idx_po_matches_one_selected_per_item`, a unique partial index on `po_matches (po_item_id)` where `is_selected` is true. The review transaction still clears other selected rows before selecting one product, and confirmation rejects a line that has more than one selected accepted match. The 409 “Only one product can be selected for this line” is returned when that index rejects a concurrent second selection.

## Technical review explanation

A customer uploads a PDF. The API checks the file, and PDF.js reads its text. A mock parser or Gemini turns that text into purchase-order fields. The server validates those fields, then matches each line to active catalogue products by exact SKU, normalized name, or fuzzy name. Those rows are suggestions. The customer accepts or rejects them. Confirm creates an order from the accepted lines that are not converted yet, prices them from the catalogue, locks stock, deducts it, and writes a `po_conversion_deduction` movement. One purchase order can create several orders. Gemini never places the order and never changes inventory.

### Questions

**Does Gemini create the order?**
No. Gemini returns text fields. `confirmPurchaseOrder` creates the order after the customer selects matches.

**Why ignore a product id from the model?**
The Gemini schema does not ask for one, and the normalizer does not keep one. Catalogue identity comes from `productMatchingService` and from the product the customer selects.

**What is the default provider?**
`mock`, including when `PO_EXTRACTION_PROVIDER` is unset. Mock does not call an external API.

**What happens if the Gemini key or model is missing?**
The upload returns 503, the file is deleted, and no purchase order is stored.

**What happens with a scanned PDF?**
PDF.js finds no text. The API saves a `failed` purchase order and returns 422. OCR is not implemented.

**How can one purchase order create two orders?**
Each confirm converts the currently accepted, unconverted lines and inserts another `purchase_order_orders` row. The purchase order stays `partially_converted` until every extracted line has been converted.

**Where does the selling price come from?**
`products.price` inside the order transaction. The unit price extracted from the PDF is stored on `po_items` and is not copied onto `order_items`.

**How is stock protected?**
The order transaction locks the product rows, checks quantity, updates stock only when enough remains, and writes the inventory movement before commit. A failed check rolls the transaction back.
