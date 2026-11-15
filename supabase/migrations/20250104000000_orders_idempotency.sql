-- Unique external platform order identity per business (idempotent imports)
DO $$ BEGIN
  ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS external_order_id TEXT,
    ADD COLUMN IF NOT EXISTS integration_id UUID,
    ADD COLUMN IF NOT EXISTS sales_channel TEXT,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_business_external
    ON public.orders (business_id, external_order_id)
    WHERE external_order_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency
    ON public.orders (business_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ecommerce_integrations table (credentials must NOT live in client localStorage in production)
CREATE TABLE IF NOT EXISTS public.ecommerce_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  name TEXT NOT NULL,
  store_url TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  -- Encrypted blob stored server-side only; never select this from the browser with anon key
  credentials_encrypted TEXT,
  credentials_mask TEXT,
  last_sync_at TIMESTAMPTZ,
  orders_synced_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, channel)
);

ALTER TABLE public.ecommerce_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage integrations" ON public.ecommerce_integrations;
CREATE POLICY "Members manage integrations"
  ON public.ecommerce_integrations FOR ALL
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
