-- Message text aligned with staging table public.temp ("SKU", "Message").
-- Applied to project via Supabase; kept here for reference/replay.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS message_text text;

UPDATE public.products AS p
SET message_text = t."Message"
FROM public.temp AS t
WHERE p.sku IS NOT NULL
  AND trim(both FROM p.sku) = trim(both FROM t."SKU");
