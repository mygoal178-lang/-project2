-- OrderFlow security hardening (additive)
-- Safe to run after the base schema. Does not drop data.

-- Ensure profiles cannot be listed cross-user
DO $$ BEGIN
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Membership: users only see their own membership rows
DO $$ BEGIN
  ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DROP POLICY IF EXISTS "Members can read own memberships" ON public.business_members;
CREATE POLICY "Members can read own memberships"
  ON public.business_members FOR SELECT
  USING (user_id = auth.uid());

-- Fix helper search_path for security definer style functions when present
DO $$ BEGIN
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.is_business_member(b_id UUID)
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.business_members
        WHERE business_id = b_id
          AND user_id = auth.uid()
          AND status = 'active'
      );
    END;
    $body$
  $f$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'is_business_member update skipped: %', SQLERRM;
END $$;
