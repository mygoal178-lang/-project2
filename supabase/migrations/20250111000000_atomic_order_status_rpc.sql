CREATE OR REPLACE FUNCTION public.transition_order_status(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order_id UUID;
  v_business_id UUID;
  v_new_status TEXT;
  v_note TEXT;
  v_old_status TEXT;
  v_allowed TEXT[];
  v_restore JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  v_order_id := NULLIF(payload->>'order_id', '')::UUID;
  v_business_id := NULLIF(payload->>'business_id', '')::UUID;
  v_new_status := NULLIF(TRIM(payload->>'status'), '');
  v_note := NULLIF(TRIM(payload->>'note'), '');

  IF v_order_id IS NULL OR v_business_id IS NULL OR v_new_status IS NULL THEN
    RAISE EXCEPTION 'order_id_business_id_status_required';
  END IF;

  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT status INTO v_old_status
  FROM public.orders
  WHERE id = v_order_id AND business_id = v_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_old_status = v_new_status THEN
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'status', v_new_status, 'unchanged', true);
  END IF;

  v_allowed := CASE v_old_status
    WHEN 'pending' THEN ARRAY['confirmed','processing','cancelled']
    WHEN 'confirmed' THEN ARRAY['processing','ready_to_ship','cancelled']
    WHEN 'processing' THEN ARRAY['ready_to_ship','shipped','cancelled']
    WHEN 'ready_to_ship' THEN ARRAY['shipped','cancelled']
    WHEN 'shipped' THEN ARRAY['delivered','returned']
    WHEN 'delivered' THEN ARRAY['returned']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (v_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'invalid_status_transition from=% to=%', v_old_status, v_new_status;
  END IF;

  UPDATE public.orders
  SET status = v_new_status, updated_at = NOW()
  WHERE id = v_order_id AND business_id = v_business_id;

  INSERT INTO public.order_status_history (order_id, status, note, created_at)
  VALUES (v_order_id, v_new_status, COALESCE(v_note, 'Status → ' || v_new_status), NOW());

  IF v_new_status IN ('cancelled', 'returned') THEN
    v_restore := public.restore_order_stock(
      v_order_id,
      CASE WHEN v_new_status = 'returned' THEN 'return_restore' ELSE 'cancellation_restore' END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'from_status', v_old_status,
    'status', v_new_status,
    'restore', v_restore
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_order_status(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_order_status(JSONB) TO authenticated;
