-- Keep-alive: called daily by Vercel Cron so the free-tier project never hits the 7-day inactivity pause.
-- SECURITY DEFINER so the anon key can call it without opening RLS; it only touches one settings row.
CREATE OR REPLACE FUNCTION public.keepalive()
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO settings (key, value) VALUES ('LAST_KEEPALIVE', NOW()::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  RETURNING NOW();
$$;

REVOKE ALL ON FUNCTION public.keepalive() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keepalive() TO anon, authenticated;
