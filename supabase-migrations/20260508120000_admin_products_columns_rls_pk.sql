-- Applied to project via Supabase; kept here for reference/replay.
-- Product merchandising + ordering + authenticated write policies

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_new_arrival boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_best_selling boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.products ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'products' AND c.contype = 'p'
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS public.products_id_seq;
    PERFORM setval(
      'public.products_id_seq',
      COALESCE((SELECT MAX(id) FROM public.products), 0),
      true
    );
    ALTER TABLE public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq');
    ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;
    ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE POLICY products_insert_authenticated ON public.products
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY products_update_authenticated ON public.products
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY products_delete_authenticated ON public.products
  FOR DELETE TO authenticated USING (true);

CREATE POLICY categories_insert_authenticated ON public.categories
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY categories_update_authenticated ON public.categories
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY categories_delete_authenticated ON public.categories
  FOR DELETE TO authenticated USING (true);

GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
