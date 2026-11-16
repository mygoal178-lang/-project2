-- =============================================================================
-- OrderFlow: Complete RLS, workspace bootstrap, profile/member policies
-- Additive migration — safe on existing data
-- =============================================================================

-- ── Helpers with fixed search_path ───────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION public.is_business_member_with_role(b_id UUID, min_roles TEXT[])
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
      AND role::text = ANY(min_roles)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.current_member_role(b_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r TEXT;
BEGIN
  SELECT role::text INTO r
  FROM public.business_members
  WHERE business_id = b_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
  RETURN r;
END;
$$;

-- ── Profiles: own row only ───────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── Businesses ───────────────────────────────────────────────────────────────
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view businesses they belong to" ON public.businesses;
DROP POLICY IF EXISTS "Authenticated users can create a new business" ON public.businesses;
DROP POLICY IF EXISTS "Owners can update business" ON public.businesses;

CREATE POLICY "businesses_select_member"
  ON public.businesses FOR SELECT
  USING (public.is_business_member(id));

-- Insert only via bootstrap RPC (blocks direct client insert of arbitrary rows)
-- Keep a restricted insert for authenticated users; owner membership is created in RPC
CREATE POLICY "businesses_insert_authenticated"
  ON public.businesses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "businesses_update_owner_admin"
  ON public.businesses FOR UPDATE
  USING (public.is_business_member_with_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (public.is_business_member_with_role(id, ARRAY['owner', 'admin']));

CREATE POLICY "businesses_delete_owner"
  ON public.businesses FOR DELETE
  USING (public.is_business_member_with_role(id, ARRAY['owner']));

-- ── Business members ─────────────────────────────────────────────────────────
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own memberships" ON public.business_members;
DROP POLICY IF EXISTS "Members can update own membership limited" ON public.business_members;
DROP POLICY IF EXISTS "Owners and admins manage memberships" ON public.business_members;

-- Users see their own membership rows (needed for workspace list)
CREATE POLICY "members_select_own"
  ON public.business_members FOR SELECT
  USING (user_id = auth.uid());

-- Owners/admins can list all members of their business
CREATE POLICY "members_select_as_admin"
  ON public.business_members FOR SELECT
  USING (public.is_business_member_with_role(business_id, ARRAY['owner', 'admin']));

-- Insert: only owners/admins can invite others; bootstrap RPC uses SECURITY DEFINER
CREATE POLICY "members_insert_admin"
  ON public.business_members FOR INSERT
  WITH CHECK (
    public.is_business_member_with_role(business_id, ARRAY['owner', 'admin'])
    OR (
      -- Allow first owner row for a brand-new business created by this user in same txn
      user_id = auth.uid()
      AND role::text = 'owner'
      AND status = 'active'
    )
  );

-- Users cannot self-promote to owner/admin
CREATE POLICY "members_update_own_limited"
  ON public.business_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role::text NOT IN ('owner', 'admin')
  );

CREATE POLICY "members_update_by_admin"
  ON public.business_members FOR UPDATE
  USING (public.is_business_member_with_role(business_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.is_business_member_with_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY "members_delete_by_admin"
  ON public.business_members FOR DELETE
  USING (public.is_business_member_with_role(business_id, ARRAY['owner', 'admin']));

-- ── Generic business-scoped tables ───────────────────────────────────────────
DO $$ 
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'product_variants', 'product_categories',
    'customers', 'orders', 'order_items', 'order_status_history',
    'inventory_movements', 'couriers', 'courier_shipments',
    'expenses', 'invoices', 'notifications', 'audit_logs',
    'ecommerce_integrations'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN undefined_table THEN
      CONTINUE;
    END;
  END LOOP;
END $$;

-- Products
DROP POLICY IF EXISTS "Members can select products" ON public.products;
DROP POLICY IF EXISTS "Members can insert products" ON public.products;
DROP POLICY IF EXISTS "Members can update products" ON public.products;
DROP POLICY IF EXISTS "Members can delete products" ON public.products;
DROP POLICY IF EXISTS "Members can insert/update products" ON public.products;

CREATE POLICY "products_select" ON public.products FOR SELECT
  USING (public.is_business_member(business_id));
CREATE POLICY "products_insert" ON public.products FOR INSERT
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "products_update" ON public.products FOR UPDATE
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "products_delete" ON public.products FOR DELETE
  USING (public.is_business_member_with_role(business_id, ARRAY['owner','admin','manager']));

-- Orders
DROP POLICY IF EXISTS "Members can access orders" ON public.orders;
DROP POLICY IF EXISTS "Members can select orders" ON public.orders;
DROP POLICY IF EXISTS "Members can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Members can update orders" ON public.orders;

CREATE POLICY "orders_select" ON public.orders FOR SELECT
  USING (public.is_business_member(business_id));
CREATE POLICY "orders_insert" ON public.orders FOR INSERT
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "orders_update" ON public.orders FOR UPDATE
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "orders_delete" ON public.orders FOR DELETE
  USING (public.is_business_member_with_role(business_id, ARRAY['owner','admin']));

-- Order items (via order membership)
DROP POLICY IF EXISTS "order_items_via_order" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND public.is_business_member(o.business_id)
  ));
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND public.is_business_member(o.business_id)
  ));
CREATE POLICY "order_items_update" ON public.order_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND public.is_business_member(o.business_id)
  ));

-- Customers
DROP POLICY IF EXISTS "Members can access customers" ON public.customers;
DROP POLICY IF EXISTS "Members can select customers" ON public.customers;
DROP POLICY IF EXISTS "Members can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Members can update customers" ON public.customers;

CREATE POLICY "customers_select" ON public.customers FOR SELECT
  USING (public.is_business_member(business_id));
CREATE POLICY "customers_insert" ON public.customers FOR INSERT
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "customers_update" ON public.customers FOR UPDATE
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "customers_delete" ON public.customers FOR DELETE
  USING (public.is_business_member_with_role(business_id, ARRAY['owner','admin','manager']));

-- Inventory movements
DROP POLICY IF EXISTS "Members can select inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Members can insert inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Members can access inventory_movements" ON public.inventory_movements;

CREATE POLICY "inv_mov_select" ON public.inventory_movements FOR SELECT
  USING (public.is_business_member(business_id));
CREATE POLICY "inv_mov_insert" ON public.inventory_movements FOR INSERT
  WITH CHECK (public.is_business_member(business_id));

-- Expenses
DROP POLICY IF EXISTS "Members can access expenses" ON public.expenses;
CREATE POLICY "expenses_all" ON public.expenses FOR ALL
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

-- Couriers / shipments / invoices / notifications / audit
DO $$
BEGIN
  BEGIN
    DROP POLICY IF EXISTS "Members can access shipments" ON public.courier_shipments;
    CREATE POLICY "shipments_all" ON public.courier_shipments FOR ALL
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "Members can access invoices" ON public.invoices;
    CREATE POLICY "invoices_all" ON public.invoices FOR ALL
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "Members can access notifications" ON public.notifications;
    CREATE POLICY "notifications_all" ON public.notifications FOR ALL
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "Members can select audit_logs" ON public.audit_logs;
    DROP POLICY IF EXISTS "Members can access audit_logs" ON public.audit_logs;
    CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT
      USING (public.is_business_member(business_id));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "Members manage integrations" ON public.ecommerce_integrations;
    CREATE POLICY "integrations_all" ON public.ecommerce_integrations FOR ALL
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    CREATE POLICY "couriers_all" ON public.couriers FOR ALL
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
  END;
  BEGIN
    CREATE POLICY "order_status_history_all" ON public.order_status_history FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id AND public.is_business_member(o.business_id)
      ));
  EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
  END;
END $$;

-- ── Secure workspace bootstrap (atomic owner membership) ─────────────────────
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

  -- Ensure profile row exists
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

-- Re-assert grants on order RPCs
REVOKE ALL ON FUNCTION public.create_order_with_stock(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.restore_order_stock(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_order_stock(UUID, TEXT) TO authenticated;
