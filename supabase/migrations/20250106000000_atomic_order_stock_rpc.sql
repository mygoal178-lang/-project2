-- OrderFlow: Atomic order creation + stock deduction RPC
-- Safe, additive. Uses row-level locking to prevent overselling under concurrency.
-- Also provides restore_order_stock for cancel/return paths.

-- Ensure helper exists with fixed search_path
CREATE OR REPLACE FUNCTION public.is_business_member(b_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = b_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- create_order_with_stock
-- Payload JSON shape (example):
-- {
--   "business_id": "uuid",
--   "customer_name": "Jane Doe",
--   "customer_phone": "+1...",
--   "customer_email": "jane@example.com",
--   "customer_id": null,
--   "shipping_address": "123 Main St",
--   "shipping_city": "Dhaka",
--   "shipping_country_code": "BD",
--   "shipping_address_json": {},
--   "payment_status": "unpaid",
--   "payment_method": "cod",
--   "currency_code": "BDT",
--   "currency_symbol": "৳",
--   "subtotal": 100.00,
--   "discount": 0,
--   "delivery_charge": 10,
--   "tax_amount": 0,
--   "total_amount": 110.00,
--   "total_cost": 40.00,
--   "internal_notes": "",
--   "sales_channel": "manual",
--   "external_order_id": null,
--   "integration_id": null,
--   "idempotency_key": "client-generated-uuid",
--   "items": [
--     {
--       "product_id": "uuid",
--       "product_title": "T-Shirt",
--       "sku": "TS-01",
--       "variant_name": "M / Black",
--       "quantity": 2,
--       "unit_price": 25.00,
--       "unit_cost": 8.00,
--       "total_price": 50.00
--     }
--   ]
-- }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_with_stock(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_customer_name TEXT;
  v_items JSONB;
  v_idempotency_key TEXT;
  v_existing_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_item JSONB;
  v_product_id UUID;
  v_qty INT;
  v_agg RECORD;
  v_product RECORD;
  v_before INT;
  v_after INT;
  v_subtotal NUMERIC(12,2);
  v_discount NUMERIC(12,2);
  v_delivery NUMERIC(12,2);
  v_tax NUMERIC(12,2);
  v_total NUMERIC(12,2);
  v_total_cost NUMERIC(12,2);
  v_actor TEXT;
BEGIN
  -- Auth required
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_business_id := (payload->>'business_id')::UUID;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'business_id_required';
  END IF;

  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  v_customer_name := NULLIF(TRIM(payload->>'customer_name'), '');
  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'customer_name_required';
  END IF;

  v_items := payload->'items';
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'items_required';
  END IF;

  -- Idempotency: return existing order if key already used
  v_idempotency_key := NULLIF(TRIM(payload->>'idempotency_key'), '');
  IF v_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.orders
    WHERE business_id = v_business_id
      AND idempotency_key = v_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'order_id', v_existing_id
      );
    END IF;
  END IF;

  -- Validate every line quantity
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::INT, 0);
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
  END LOOP;

  -- Monetary fields
  v_subtotal := COALESCE((payload->>'subtotal')::NUMERIC, 0);
  v_discount := COALESCE((payload->>'discount')::NUMERIC, 0);
  v_delivery := COALESCE((payload->>'delivery_charge')::NUMERIC, 0);
  v_tax := COALESCE((payload->>'tax_amount')::NUMERIC, 0);
  v_total := COALESCE((payload->>'total_amount')::NUMERIC, 0);
  v_total_cost := COALESCE((payload->>'total_cost')::NUMERIC, 0);

  IF v_discount < 0 OR v_delivery < 0 OR v_tax < 0 OR v_subtotal < 0 OR v_total < 0 THEN
    RAISE EXCEPTION 'negative_amounts_not_allowed';
  END IF;

  IF v_discount > v_subtotal + v_delivery + v_tax THEN
    RAISE EXCEPTION 'discount_exceeds_order';
  END IF;

  -- Aggregate quantities by product_id; lock in deterministic order
  FOR v_agg IN
    SELECT
      (elem->>'product_id')::UUID AS product_id,
      SUM((elem->>'quantity')::INT) AS qty
    FROM jsonb_array_elements(v_items) AS elem
    WHERE NULLIF(elem->>'product_id', '') IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  LOOP
    SELECT id, stock, title, business_id
      INTO v_product
    FROM public.products
    WHERE id = v_agg.product_id
      AND business_id = v_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found: %', v_agg.product_id;
    END IF;

    v_before := COALESCE(v_product.stock, 0);
    IF v_agg.qty > v_before THEN
      RAISE EXCEPTION 'insufficient_stock: product=% available=% requested=%',
        v_product.title, v_before, v_agg.qty;
    END IF;
  END LOOP;

  v_order_number := 'OF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  SELECT COALESCE(p.full_name, 'System') INTO v_actor
  FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.orders (
    business_id,
    order_number,
    customer_id,
    customer_name,
    customer_phone,
    customer_email,
    shipping_address,
    shipping_city,
    status,
    payment_status,
    payment_method,
    subtotal,
    discount,
    delivery_charge,
    total_amount,
    total_cost,
    estimated_profit,
    currency_code,
    currency_symbol,
    tax_amount,
    shipping_address_json,
    shipping_country_code,
    sales_channel,
    external_order_id,
    integration_id,
    idempotency_key,
    internal_notes,
    created_at,
    updated_at
  ) VALUES (
    v_business_id,
    v_order_number,
    NULLIF(payload->>'customer_id', '')::UUID,
    v_customer_name,
    COALESCE(NULLIF(payload->>'customer_phone', ''), ''),
    NULLIF(payload->>'customer_email', ''),
    COALESCE(NULLIF(payload->>'shipping_address', ''), COALESCE(payload->'shipping_address_json'->>'address_line1', '')),
    COALESCE(NULLIF(payload->>'shipping_city', ''), 'Unknown'),
    'pending'::order_status,
    COALESCE(NULLIF(payload->>'payment_status', ''), 'unpaid')::payment_status,
    COALESCE(NULLIF(payload->>'payment_method', ''), 'cod'),
    v_subtotal,
    v_discount,
    v_delivery,
    v_total,
    v_total_cost,
    v_total - v_total_cost,
    COALESCE(NULLIF(payload->>'currency_code', ''), 'USD'),
    COALESCE(NULLIF(payload->>'currency_symbol', ''), '$'),
    v_tax,
    COALESCE(payload->'shipping_address_json', '{}'::jsonb),
    COALESCE(NULLIF(payload->>'shipping_country_code', ''), 'US'),
    COALESCE(NULLIF(payload->>'sales_channel', ''), 'manual'),
    NULLIF(payload->>'external_order_id', ''),
    NULLIF(payload->>'integration_id', '')::UUID,
    v_idempotency_key,
    NULLIF(payload->>'internal_notes', ''),
    v_now,
    v_now
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_title,
      variant_name,
      sku,
      quantity,
      unit_price,
      unit_cost,
      total_price
    ) VALUES (
      v_order_id,
      NULLIF(v_item->>'product_id', '')::UUID,
      COALESCE(NULLIF(v_item->>'product_title', ''), 'Item'),
      NULLIF(v_item->>'variant_name', ''),
      COALESCE(NULLIF(v_item->>'sku', ''), ''),
      (v_item->>'quantity')::INT,
      COALESCE((v_item->>'unit_price')::NUMERIC, 0),
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
      COALESCE((v_item->>'total_price')::NUMERIC, 0)
    );
  END LOOP;

  FOR v_agg IN
    SELECT
      (elem->>'product_id')::UUID AS product_id,
      SUM((elem->>'quantity')::INT) AS qty,
      MAX(elem->>'product_title') AS title
    FROM jsonb_array_elements(v_items) AS elem
    WHERE NULLIF(elem->>'product_id', '') IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  LOOP
    SELECT id, stock, title
      INTO v_product
    FROM public.products
    WHERE id = v_agg.product_id
      AND business_id = v_business_id
    FOR UPDATE;

    v_before := COALESCE(v_product.stock, 0);
    v_after := v_before - v_agg.qty;

    UPDATE public.products
    SET stock = v_after,
        updated_at = v_now
    WHERE id = v_agg.product_id
      AND business_id = v_business_id;

    INSERT INTO public.inventory_movements (
      business_id,
      product_id,
      quantity_change,
      resulting_stock,
      movement_type,
      reference_order_number,
      notes,
      created_at
    ) VALUES (
      v_business_id,
      v_agg.product_id,
      -v_agg.qty,
      v_after,
      'sale',
      v_order_number,
      'Order ' || v_order_number,
      v_now
    );
  END LOOP;

  INSERT INTO public.order_status_history (order_id, status, note, actor_name, created_at)
  VALUES (v_order_id, 'pending'::order_status, 'Order created', COALESCE(v_actor, 'System'), v_now);

  IF NULLIF(payload->>'customer_id', '') IS NOT NULL THEN
    UPDATE public.customers
    SET total_orders = COALESCE(total_orders, 0) + 1,
        total_spent = COALESCE(total_spent, 0) + v_total,
        last_order_date = v_now,
        updated_at = v_now
    WHERE id = (payload->>'customer_id')::UUID
      AND business_id = v_business_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', v_order_id,
    'order_number', v_order_number
  );

EXCEPTION
  WHEN unique_violation THEN
    IF v_idempotency_key IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM public.orders
      WHERE business_id = v_business_id AND idempotency_key = v_idempotency_key
      LIMIT 1;
      IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', true,
          'idempotent', true,
          'order_id', v_existing_id
        );
      END IF;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_with_stock(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- restore_order_stock: restore inventory exactly once for cancelled/returned orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_id UUID, p_reason TEXT DEFAULT 'cancellation_restore')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_product RECORD;
  v_before INT;
  v_after INT;
  v_now TIMESTAMPTZ := NOW();
  v_restored INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF NOT public.is_business_member(v_order.business_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  IF v_order.status::text NOT IN ('cancelled', 'returned') THEN
    RAISE EXCEPTION 'order_not_cancellable_state';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE business_id = v_order.business_id
      AND reference_order_number = v_order.order_number
      AND movement_type IN ('cancellation_restore', 'return_restore')
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_restored', true, 'restored_lines', 0);
  END IF;

  FOR v_item IN
    SELECT product_id, SUM(quantity) AS qty, MAX(product_title) AS title
    FROM public.order_items
    WHERE order_id = p_order_id
      AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    SELECT id, stock INTO v_product
    FROM public.products
    WHERE id = v_item.product_id
      AND business_id = v_order.business_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_before := COALESCE(v_product.stock, 0);
    v_after := v_before + v_item.qty;

    UPDATE public.products
    SET stock = v_after, updated_at = v_now
    WHERE id = v_item.product_id;

    INSERT INTO public.inventory_movements (
      business_id,
      product_id,
      quantity_change,
      resulting_stock,
      movement_type,
      reference_order_number,
      notes,
      created_at
    ) VALUES (
      v_order.business_id,
      v_item.product_id,
      v_item.qty,
      v_after,
      CASE WHEN p_reason = 'return_restore' THEN 'return_restore' ELSE 'cancellation_restore' END,
      v_order.order_number,
      'Stock restored for order ' || v_order.order_number,
      v_now
    );

    v_restored := v_restored + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'already_restored', false,
    'restored_lines', v_restored
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_order_stock(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_order_stock(UUID, TEXT) TO authenticated;
