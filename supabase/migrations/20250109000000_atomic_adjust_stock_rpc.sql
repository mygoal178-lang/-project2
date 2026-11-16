-- Atomic stock adjustment with inventory movement (prevents partial updates)
CREATE OR REPLACE FUNCTION public.adjust_product_stock(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_business_id UUID;
  v_product_id UUID;
  v_delta NUMERIC;
  v_reason TEXT;
  v_note TEXT;
  v_before NUMERIC;
  v_after NUMERIC;
  v_title TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_business_id := NULLIF(payload->>'business_id', '')::UUID;
  v_product_id := NULLIF(payload->>'product_id', '')::UUID;
  v_delta := COALESCE((payload->>'quantity_change')::NUMERIC, 0);
  v_reason := COALESCE(NULLIF(TRIM(payload->>'reason'), ''), 'manual_adjustment');
  v_note := NULLIF(TRIM(payload->>'note'), '');

  IF v_business_id IS NULL OR v_product_id IS NULL THEN
    RAISE EXCEPTION 'business_id_and_product_id_required';
  END IF;
  IF v_delta = 0 THEN
    RAISE EXCEPTION 'quantity_change_must_be_nonzero';
  END IF;

  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT stock, title INTO v_before, v_title
  FROM public.products
  WHERE id = v_product_id AND business_id = v_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  v_before := COALESCE(v_before, 0);
  v_after := v_before + v_delta;

  IF v_after < 0 THEN
    RAISE EXCEPTION 'insufficient_stock available=% requested_change=%', v_before, v_delta;
  END IF;

  UPDATE public.products
  SET stock = v_after, updated_at = NOW()
  WHERE id = v_product_id AND business_id = v_business_id;

  INSERT INTO public.inventory_movements (
    business_id, product_id, quantity_change, resulting_stock, movement_type, notes
  ) VALUES (
    v_business_id, v_product_id, v_delta, v_after, v_reason, v_note
  );

  RETURN jsonb_build_object(
    'success', true,
    'product_id', v_product_id,
    'stock_before', v_before,
    'stock_after', v_after,
    'quantity_change', v_delta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_product_stock(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(JSONB) TO authenticated;
