-- OrderFlow: Stricter RLS, role protection, and membership controls
-- Additive and safe for existing databases.

-- Helper: is active member with minimum role
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

-- Prevent users from elevating their own role to owner/admin via client
DROP POLICY IF EXISTS "Members can update own membership limited" ON public.business_members;
CREATE POLICY "Members can update own membership limited"
  ON public.business_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role::text NOT IN ('owner', 'admin')  -- cannot self-promote to owner/admin
  );

-- Only owners/admins can change other members' roles
DROP POLICY IF EXISTS "Owners and admins manage memberships" ON public.business_members;
CREATE POLICY "Owners and admins manage memberships"
  ON public.business_members FOR ALL
  USING (
    public.is_business_member_with_role(business_id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    public.is_business_member_with_role(business_id, ARRAY['owner', 'admin'])
  );

-- Stricter product policies
DROP POLICY IF EXISTS "Members can select products" ON public.products;
CREATE POLICY "Members can select products"
  ON public.products FOR SELECT
  USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members can insert products" ON public.products;
CREATE POLICY "Members can insert products"
  ON public.products FOR INSERT
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members can update products" ON public.products;
CREATE POLICY "Members can update products"
  ON public.products FOR UPDATE
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members can delete products" ON public.products;
CREATE POLICY "Members can delete products"
  ON public.products FOR DELETE
  USING (public.is_business_member_with_role(business_id, ARRAY['owner', 'admin', 'manager']));

-- Same pattern for orders
DROP POLICY IF EXISTS "Members can access orders" ON public.orders;
CREATE POLICY "Members can select orders"
  ON public.orders FOR SELECT
  USING (public.is_business_member(business_id));

CREATE POLICY "Members can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Members can update orders"
  ON public.orders FOR UPDATE
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

-- Customers
DROP POLICY IF EXISTS "Members can access customers" ON public.customers;
CREATE POLICY "Members can select customers"
  ON public.customers FOR SELECT
  USING (public.is_business_member(business_id));

CREATE POLICY "Members can insert customers"
  ON public.customers FOR INSERT
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Members can update customers"
  ON public.customers FOR UPDATE
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

-- Inventory movements: only members, insert via trusted functions ideally
DROP POLICY IF EXISTS "Members can access inventory_movements" ON public.inventory_movements;
CREATE POLICY "Members can select inventory_movements"
  ON public.inventory_movements FOR SELECT
  USING (public.is_business_member(business_id));

CREATE POLICY "Members can insert inventory_movements"
  ON public.inventory_movements FOR INSERT
  WITH CHECK (public.is_business_member(business_id));

-- Audit logs: read-only for members, insert only via service or security definer
DROP POLICY IF EXISTS "Members can access audit_logs" ON public.audit_logs;
CREATE POLICY "Members can select audit_logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_business_member(business_id));

-- ecommerce_integrations: never expose credentials_encrypted to anon clients in practice
-- (application must select only mask columns)
COMMENT ON COLUMN public.ecommerce_integrations.credentials_encrypted IS
  'Server-side encrypted credentials only. Never return this column to the browser. Use service role or edge function for decrypt.';
