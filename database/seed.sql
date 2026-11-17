-- BNC Motors AI-Powered Product Ordering System
-- Demo users, catalogue products, historical orders, and matching stock movements.
-- Safe to run more than once: existing emails, SKUs, demo order numbers, and
-- demo stock movements are left unchanged. Stock quantities already stored for
-- an existing SKU are not reduced again.
-- Password hashes were generated with the server bcrypt package (cost 10).
-- Plain-text passwords are not stored in this file.
-- Run database/schema.sql on a fresh database, or migration 001 on an existing one, before this file.
-- Purchase orders are not seeded. A stored PDF must live under server/uploads/purchase-orders.

BEGIN;

-- Demo accounts. One administrator and two customers.
-- ON CONFLICT skips a row when that email is already present.
INSERT INTO users (name, email, phone, company_name, password_hash, role, is_active)
VALUES
    (
        'BNC Motors Admin',
        'admin@bncmotors.com',
        '9845012345',
        'BNC Motors',
        '$2b$10$XuFmJCjKIVHLefq39SW3GOYzIVLfHt1y2ovjMMuk05is6yziQ.3Bu',
        'admin',
        true
    ),
    (
        'BNC Motors Customer',
        'customer@bncmotors.com',
        '9845098765',
        'Metro Auto Garage',
        '$2b$10$Tuy./I2aEwAhRgcjbKcjnu63cuYAtH.D.1ToUQ.qyywjk067jrYP6',
        'customer',
        true
    ),
    (
        'BNC Motors Customer Two',
        'customer2@bncmotors.com',
        '9845123456',
        'Harbour Line Motors',
        '$2b$10$MrkKPjzslVI8KIU2OCKD4.shCgnW5GAkDG8952pzDGdWH2EJ//ZuS',
        'customer',
        true
    )
ON CONFLICT (email) DO NOTHING;

-- Automotive spare parts for the product catalog.
-- Prices are INR. ON CONFLICT skips a row when that SKU is already present.
INSERT INTO products (
    name,
    sku,
    description,
    image_url,
    category,
    brand,
    unit,
    price,
    currency,
    stock_quantity,
    reorder_level,
    is_active
)
VALUES
    (
        'Front Ceramic Brake Pad Set',
        'BNC-BP-FR-01',
        'Ceramic front brake pads for passenger cars. Includes wear indicators and anti-squeal shims for both front wheels.',
        NULL,
        'Brakes',
        'Bosch',
        'set',
        2499.00,
        'INR',
        48,
        12,
        true
    ),
    (
        'Spin-On Engine Oil Filter',
        'BNC-OF-220',
        'Spin-on oil filter with a bypass valve and anti-drainback membrane. Fits common 1.2L to 1.6L petrol engines.',
        NULL,
        'Filters',
        'Mann-Filter',
        'pcs',
        349.00,
        'INR',
        150,
        40,
        true
    ),
    (
        'Iridium Spark Plug Set',
        'BNC-SP-IR4',
        'Set of four iridium-tip spark plugs for four-cylinder petrol engines. Pre-gapped for standard ignition systems.',
        NULL,
        'Ignition',
        'NGK',
        'set',
        899.00,
        'INR',
        86,
        20,
        true
    ),
    (
        'Panel Engine Air Filter',
        'BNC-AF-310',
        'Pleated panel air filter that traps dust before it reaches the intake. Direct-fit replacement for compact hatchbacks and sedans.',
        NULL,
        'Filters',
        'Mann-Filter',
        'pcs',
        599.00,
        'INR',
        72,
        24,
        true
    ),
    (
        '12V 90A Alternator',
        'BNC-ALT-90A',
        'Remanufactured 12-volt alternator rated at 90 amps. Includes pulley and regulator for everyday passenger vehicles.',
        NULL,
        'Electrical',
        'Bosch',
        'pcs',
        8450.00,
        'INR',
        14,
        4,
        true
    ),
    (
        'Aluminum Radiator Assembly',
        'BNC-RAD-AL16',
        'Aluminum radiator with plastic end tanks for compact cars. Core height suits standard 1.4L and 1.5L cooling systems.',
        NULL,
        'Cooling',
        'Valeo',
        'pcs',
        6200.00,
        'INR',
        9,
        3,
        true
    ),
    (
        'Clutch Kit with Release Bearing',
        'BNC-CK-240',
        'Three-piece clutch kit: pressure plate, organic disc, and release bearing. Built for 240 mm clutch housings.',
        NULL,
        'Transmission',
        'Valeo',
        'kit',
        7890.00,
        'INR',
        16,
        4,
        true
    ),
    (
        'Rear Gas Shock Absorber',
        'BNC-SH-RR-01',
        'Gas-charged rear shock absorber for independent rear suspension. Sold individually for the rear left or right side.',
        NULL,
        'Suspension',
        'Monroe',
        'pcs',
        3150.00,
        'INR',
        28,
        8,
        true
    ),
    (
        'Timing Belt Kit',
        'BNC-TB-118',
        'Timing belt kit with belt, tensioner, and idler pulley. Intended for interference engines that use a 118-tooth belt.',
        NULL,
        'Engine',
        'Gates',
        'kit',
        4560.00,
        'INR',
        18,
        5,
        true
    ),
    (
        'Left Headlamp Assembly',
        'BNC-HL-LH-01',
        'Driver-side halogen headlamp assembly with clear lens and black housing. Includes bulb holders; bulbs are sold separately.',
        NULL,
        'Lighting',
        'Hella',
        'pcs',
        5340.00,
        'INR',
        11,
        3,
        true
    ),
    (
        'Cabin Pollen Filter',
        'BNC-CF-118',
        'Activated-carbon cabin filter for dust and odour. Low demo stock is below the reorder level.',
        NULL,
        'Filters',
        'Mann-Filter',
        'pcs',
        429.00,
        'INR',
        3,
        8,
        true
    ),
    (
        'Frame Wiper Blade 24 inch',
        'BNC-WB-24',
        '24-inch framed wiper blade with a natural rubber edge. Seeded with no units on hand.',
        NULL,
        'Wipers',
        'Bosch',
        'pcs',
        275.00,
        'INR',
        0,
        6,
        true
    ),
    (
        'H4 Halogen Headlamp Bulb',
        'BNC-BLB-H4',
        'Discontinued H4 halogen bulb kept inactive so the admin catalogue can show a non-active product. It is hidden from the customer catalogue.',
        NULL,
        'Lighting',
        'Philips',
        'pcs',
        180.00,
        'INR',
        40,
        10,
        false
    )
ON CONFLICT (sku) DO NOTHING;

-- Historical cart orders. Numbers are reserved for this seed and are not rewritten
-- from the identity id. Live checkout still assigns BNC-ORD- plus the new id.
-- Payment status stays pending because the API stores that value and does not collect payment.
-- Re-running this file does not insert another copy of the same order number.
INSERT INTO orders (
    order_number,
    user_id,
    subtotal,
    tax_amount,
    shipping_charge,
    total_amount,
    status,
    payment_method,
    payment_status,
    shipping_address,
    billing_address,
    notes,
    created_at,
    updated_at
)
SELECT
    demo.order_number,
    users.id,
    demo.subtotal,
    0.00,
    0.00,
    demo.subtotal,
    demo.status,
    demo.payment_method,
    'pending',
    demo.shipping_address,
    demo.billing_address,
    demo.notes,
    demo.created_at,
    demo.updated_at
FROM users
JOIN (
    VALUES
        (
            'BNC-ORD-DEMO-0001',
            'customer@bncmotors.com',
            6394.00,
            'delivered',
            'pay_later',
            '{"name":"Metro Auto Garage","line1":"18 Hosur Road","city":"Bengaluru","postal_code":"560029","phone":"9845098765"}'::jsonb,
            '{"name":"Metro Auto Garage","line1":"18 Hosur Road","city":"Bengaluru","postal_code":"560029"}'::jsonb,
            'Demo seed delivered order for Metro Auto Garage.',
            '2026-10-28 10:15:00+05:30'::timestamptz,
            '2026-11-02 16:40:00+05:30'::timestamptz
        ),
        (
            'BNC-ORD-DEMO-0002',
            'customer@bncmotors.com',
            6899.00,
            'pending',
            'cod',
            '{"name":"Metro Auto Garage","line1":"18 Hosur Road","city":"Bengaluru","postal_code":"560029","phone":"9845098765"}'::jsonb,
            '{"name":"Metro Auto Garage","line1":"18 Hosur Road","city":"Bengaluru","postal_code":"560029"}'::jsonb,
            'Demo seed pending order for Metro Auto Garage.',
            '2026-11-14 11:30:00+05:30'::timestamptz,
            '2026-11-14 11:30:00+05:30'::timestamptz
        ),
        (
            'BNC-ORD-DEMO-0003',
            'customer2@bncmotors.com',
            8789.00,
            'shipped',
            'pay_later',
            '{"name":"Harbour Line Motors","line1":"42 Reay Road","city":"Mumbai","postal_code":"400010","phone":"9845123456"}'::jsonb,
            '{"name":"Harbour Line Motors","line1":"42 Reay Road","city":"Mumbai","postal_code":"400010"}'::jsonb,
            'Demo seed shipped order for Harbour Line Motors.',
            '2026-11-03 09:45:00+05:30'::timestamptz,
            '2026-11-08 14:05:00+05:30'::timestamptz
        ),
        (
            'BNC-ORD-DEMO-0004',
            'customer2@bncmotors.com',
            13790.00,
            'confirmed',
            'cod',
            '{"name":"Harbour Line Motors","line1":"42 Reay Road","city":"Mumbai","postal_code":"400010","phone":"9845123456"}'::jsonb,
            '{"name":"Harbour Line Motors","line1":"42 Reay Road","city":"Mumbai","postal_code":"400010"}'::jsonb,
            'Demo seed confirmed order for Harbour Line Motors.',
            '2026-11-16 15:20:00+05:30'::timestamptz,
            '2026-11-16 15:20:00+05:30'::timestamptz
        ),
        (
            'BNC-ORD-DEMO-0005',
            'customer2@bncmotors.com',
            4560.00,
            'cancelled',
            'pay_later',
            '{"name":"Harbour Line Motors","line1":"42 Reay Road","city":"Mumbai","postal_code":"400010","phone":"9845123456"}'::jsonb,
            '{"name":"Harbour Line Motors","line1":"42 Reay Road","city":"Mumbai","postal_code":"400010"}'::jsonb,
            'Demo seed cancelled order for Harbour Line Motors. Stock was restored.',
            '2026-11-06 13:00:00+05:30'::timestamptz,
            '2026-11-06 18:10:00+05:30'::timestamptz
        )
) AS demo (
    order_number,
    email,
    subtotal,
    status,
    payment_method,
    shipping_address,
    billing_address,
    notes,
    created_at,
    updated_at
) ON demo.email = users.email
ON CONFLICT (order_number) DO NOTHING;

INSERT INTO order_items (
    order_id,
    product_id,
    product_name,
    product_sku,
    quantity,
    unit_price,
    line_total,
    tax_amount
)
SELECT
    orders.id,
    products.id,
    products.name,
    products.sku,
    lines.quantity,
    lines.unit_price,
    lines.line_total,
    0.00
FROM orders
JOIN (
    VALUES
        ('BNC-ORD-DEMO-0001', 'BNC-BP-FR-01', 2, 2499.00, 4998.00),
        ('BNC-ORD-DEMO-0001', 'BNC-OF-220', 4, 349.00, 1396.00),
        ('BNC-ORD-DEMO-0002', 'BNC-SH-RR-01', 2, 3150.00, 6300.00),
        ('BNC-ORD-DEMO-0002', 'BNC-AF-310', 1, 599.00, 599.00),
        ('BNC-ORD-DEMO-0003', 'BNC-SP-IR4', 1, 899.00, 899.00),
        ('BNC-ORD-DEMO-0003', 'BNC-CK-240', 1, 7890.00, 7890.00),
        ('BNC-ORD-DEMO-0004', 'BNC-ALT-90A', 1, 8450.00, 8450.00),
        ('BNC-ORD-DEMO-0004', 'BNC-HL-LH-01', 1, 5340.00, 5340.00),
        ('BNC-ORD-DEMO-0005', 'BNC-TB-118', 1, 4560.00, 4560.00)
) AS lines (order_number, sku, quantity, unit_price, line_total)
    ON lines.order_number = orders.order_number
JOIN products ON products.sku = lines.sku
WHERE orders.notes LIKE 'Demo seed %'
  AND NOT EXISTS (
      SELECT 1
      FROM order_items AS existing
      WHERE existing.order_id = orders.id
        AND existing.product_id = products.id
  );

-- Movements describe sales already reflected in the seeded stock_quantity.
-- new_quantity is the quantity stored on the product, so this insert does not
-- subtract from stock again. A cancelled line is a deduction followed by a restoration
-- that returns to the same quantity.
INSERT INTO inventory_movements (
    product_id,
    adjustment_type,
    previous_quantity,
    adjustment_quantity,
    new_quantity,
    remarks,
    reference_type,
    reference_id,
    related_order_id,
    updated_by,
    created_at
)
SELECT
    products.id,
    moves.adjustment_type,
    CASE
        WHEN moves.adjustment_type = 'order_restoration' THEN products.stock_quantity - moves.quantity
        WHEN moves.net_zero THEN products.stock_quantity
        ELSE products.stock_quantity + moves.quantity
    END,
    moves.quantity,
    CASE
        WHEN moves.adjustment_type = 'order_deduction' AND moves.net_zero THEN products.stock_quantity - moves.quantity
        ELSE products.stock_quantity
    END,
    CASE
        WHEN moves.adjustment_type = 'order_restoration'
            THEN 'Stock restored after cancelling order ' || orders.order_number
        ELSE 'Stock deducted for order ' || orders.order_number
    END,
    'order',
    orders.id,
    orders.id,
    CASE
        WHEN moves.adjustment_type = 'order_restoration' THEN admin_user.id
        ELSE orders.user_id
    END,
    moves.created_at
FROM orders
JOIN (
    VALUES
        ('BNC-ORD-DEMO-0001', 'BNC-BP-FR-01', 'order_deduction', 2, false, '2026-10-28 10:15:00+05:30'::timestamptz),
        ('BNC-ORD-DEMO-0001', 'BNC-OF-220', 'order_deduction', 4, false, '2026-10-28 10:15:00+05:30'::timestamptz),
        ('BNC-ORD-DEMO-0002', 'BNC-SH-RR-01', 'order_deduction', 2, false, '2026-11-14 11:30:00+05:30'::timestamptz),
        ('BNC-ORD-DEMO-0002', 'BNC-AF-310', 'order_deduction', 1, false, '2026-11-14 11:30:00+05:30'::timestamptz),
        ('BNC-ORD-DEMO-0003', 'BNC-SP-IR4', 'order_deduction', 1, false, '2026-11-03 09:45:00+05:30'::timestamptz),
        ('BNC-ORD-DEMO-0003', 'BNC-CK-240', 'order_deduction', 1, false, '2026-11-03 09:45:00+05:30'::timestamptz),
        ('BNC-ORD-DEMO-0004', 'BNC-ALT-90A', 'order_deduction', 1, false, '2026-11-16 15:20:00+05:30'::timestamptz),
        ('BNC-ORD-DEMO-0004', 'BNC-HL-LH-01', 'order_deduction', 1, false, '2026-11-16 15:20:00+05:30'::timestamptz),
        ('BNC-ORD-DEMO-0005', 'BNC-TB-118', 'order_deduction', 1, true, '2026-11-06 13:00:00+05:30'::timestamptz),
        ('BNC-ORD-DEMO-0005', 'BNC-TB-118', 'order_restoration', 1, true, '2026-11-06 18:10:00+05:30'::timestamptz)
) AS moves (order_number, sku, adjustment_type, quantity, net_zero, created_at)
    ON moves.order_number = orders.order_number
JOIN products ON products.sku = moves.sku
JOIN users AS admin_user ON admin_user.email = 'admin@bncmotors.com'
WHERE orders.notes LIKE 'Demo seed %'
  AND products.stock_quantity >= moves.quantity
  AND NOT EXISTS (
      SELECT 1
      FROM inventory_movements AS existing
      WHERE existing.product_id = products.id
        AND existing.adjustment_type = moves.adjustment_type
        AND existing.related_order_id = orders.id
  );

COMMIT;
