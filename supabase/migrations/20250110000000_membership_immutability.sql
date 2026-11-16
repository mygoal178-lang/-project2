-- Prevent membership reassignment and identity tampering
CREATE OR REPLACE FUNCTION public.guard_business_member_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  actor_role TEXT;
  owner_count INT;
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'membership_business_id_immutable';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'membership_user_id_immutable';
  END IF;

  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role::text INTO actor_role
  FROM public.business_members
  WHERE business_id = NEW.business_id
    AND user_id = actor
    AND status = 'active'
  LIMIT 1;

  IF OLD.user_id = actor AND NEW.user_id = actor THEN
    IF NEW.role::text IS DISTINCT FROM OLD.role::text THEN
      RAISE EXCEPTION 'privilege_escalation_denied';
    END IF;
  END IF;

  IF NEW.role::text = 'owner' AND (actor_role IS NULL OR actor_role <> 'owner') THEN
    IF OLD.role::text IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'only_owner_can_assign_owner';
    END IF;
  END IF;

  IF (OLD.role::text = 'owner' AND OLD.status = 'active')
     AND (NEW.role::text <> 'owner' OR NEW.status <> 'active') THEN
    SELECT COUNT(*) INTO owner_count
    FROM public.business_members
    WHERE business_id = OLD.business_id
      AND role::text = 'owner'
      AND status = 'active'
      AND id <> OLD.id
    FOR UPDATE;
    IF owner_count = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_owner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_business_member_role ON public.business_members;
CREATE TRIGGER trg_guard_business_member_role
  BEFORE UPDATE ON public.business_members
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_business_member_role_change();

CREATE OR REPLACE FUNCTION public.invite_business_member(
  p_business_id UUID,
  p_user_id UUID,
  p_role TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_actor_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_role NOT IN ('admin', 'manager', 'staff') THEN RAISE EXCEPTION 'invalid_role'; END IF;

  SELECT role::text INTO v_actor_role
  FROM public.business_members
  WHERE business_id = p_business_id AND user_id = v_uid AND status = 'active'
  LIMIT 1;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_role = 'admin' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'only_owner_can_invite_admin';
  END IF;

  INSERT INTO public.business_members (business_id, user_id, role, status)
  VALUES (p_business_id, p_user_id, p_role, 'active')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'business_id', p_business_id, 'user_id', p_user_id, 'role', p_role);
END;
$$;

REVOKE ALL ON FUNCTION public.invite_business_member(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_business_member(UUID, UUID, TEXT) TO authenticated;
