-- =============================================================================
-- CRITICAL FIX: Prevent self-assignment of owner/admin and cross-tenant joins
-- Previous members_insert policy allowed any authenticated user to insert
-- themselves as owner on ANY business_id. Remove that path entirely.
-- Workspace bootstrap MUST go through create_workspace_with_owner (SECURITY DEFINER).
-- =============================================================================

-- Drop permissive insert policies
DROP POLICY IF EXISTS "members_insert_admin" ON public.business_members;
DROP POLICY IF EXISTS "businesses_insert_authenticated" ON public.businesses;

-- Businesses: no direct client INSERT (RPC only)
CREATE POLICY "businesses_insert_denied_clients"
  ON public.businesses FOR INSERT
  WITH CHECK (false);

-- Members: only existing owner/admin may invite others (never self-owner via client)
CREATE POLICY "members_insert_by_admin_only"
  ON public.business_members FOR INSERT
  WITH CHECK (
    public.is_business_member_with_role(business_id, ARRAY['owner', 'admin'])
    AND user_id IS NOT NULL
    -- Inviter cannot invent an owner role for a third party either unless they are owner
    AND (
      role::text <> 'owner'
      OR public.is_business_member_with_role(business_id, ARRAY['owner'])
    )
  );

-- Tighten self-update: members may only update non-privileged fields on own row
DROP POLICY IF EXISTS "members_update_own_limited" ON public.business_members;
CREATE POLICY "members_update_own_limited"
  ON public.business_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role::text NOT IN ('owner', 'admin', 'manager')
    AND status IN ('active', 'disabled')
  );

-- Admin update cannot demote last owner (enforced in trigger below)
DROP POLICY IF EXISTS "members_update_by_admin" ON public.business_members;
CREATE POLICY "members_update_by_admin"
  ON public.business_members FOR UPDATE
  USING (public.is_business_member_with_role(business_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.is_business_member_with_role(business_id, ARRAY['owner', 'admin']));

-- Trigger: block privilege escalation and last-owner removal
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
  -- Service role / SECURITY DEFINER bootstrap may set owner once
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role::text INTO actor_role
  FROM public.business_members
  WHERE business_id = NEW.business_id
    AND user_id = actor
    AND status = 'active'
  LIMIT 1;

  -- Self-service: never raise own role
  IF OLD.user_id = actor AND NEW.user_id = actor THEN
    IF NEW.role::text IN ('owner', 'admin', 'manager')
       AND (OLD.role::text IS DISTINCT FROM NEW.role::text) THEN
      RAISE EXCEPTION 'privilege_escalation_denied';
    END IF;
  END IF;

  -- Non-owners cannot assign owner
  IF NEW.role::text = 'owner' AND (actor_role IS NULL OR actor_role <> 'owner') THEN
    IF OLD.role::text IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'only_owner_can_assign_owner';
    END IF;
  END IF;

  -- Prevent removing the last active owner
  IF (OLD.role::text = 'owner' AND OLD.status = 'active')
     AND (NEW.role::text <> 'owner' OR NEW.status <> 'active') THEN
    SELECT COUNT(*) INTO owner_count
    FROM public.business_members
    WHERE business_id = OLD.business_id
      AND role::text = 'owner'
      AND status = 'active'
      AND id <> OLD.id;
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

-- Ensure workspace RPC remains the only owner bootstrap path
CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_business_id UUID;
  v_slug TEXT;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_name := NULLIF(TRIM(payload->>'name'), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  v_slug := COALESCE(
    NULLIF(TRIM(payload->>'slug'), ''),
    lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'))
  );
  v_slug := trim(both '-' from v_slug) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    v_uid,
    COALESCE(payload->>'email', (SELECT email FROM auth.users WHERE id = v_uid)),
    COALESCE(NULLIF(payload->>'owner_name', ''), 'Owner')
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        updated_at = NOW();

  INSERT INTO public.businesses (
    name, slug, category, country, currency, currency_symbol,
    phone, email, address, city, timezone,
    subscription_plan, subscription_status, monthly_order_limit
  ) VALUES (
    v_name,
    v_slug,
    COALESCE(payload->>'category', 'Retail'),
    COALESCE(payload->>'country', 'United States'),
    COALESCE(payload->>'currency', 'USD'),
    COALESCE(payload->>'currency_symbol', '$'),
    COALESCE(payload->>'phone', ''),
    COALESCE(payload->>'email', ''),
    COALESCE(payload->>'address', ''),
    COALESCE(payload->>'city', ''),
    COALESCE(payload->>'timezone', 'UTC'),
    'free',
    'active',
    50
  )
  RETURNING id INTO v_business_id;

  INSERT INTO public.business_members (business_id, user_id, role, status)
  VALUES (v_business_id, v_uid, 'owner', 'active');

  RETURN jsonb_build_object(
    'success', true,
    'business_id', v_business_id,
    'slug', v_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_with_owner(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner(JSONB) TO authenticated;
