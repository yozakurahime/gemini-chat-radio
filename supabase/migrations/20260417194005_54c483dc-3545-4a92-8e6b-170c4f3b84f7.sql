
-- ============================================================
-- 1. Restrict public SELECT on sensitive ad-related tables
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read ads" ON public.ads;
CREATE POLICY "Authenticated can read ads"
  ON public.ads FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can read advertisers" ON public.advertisers;
CREATE POLICY "Authenticated can read advertisers"
  ON public.advertisers FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can read contracts" ON public.ad_contracts;
CREATE POLICY "Authenticated can read contracts"
  ON public.ad_contracts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can read logs" ON public.ad_execution_logs;
CREATE POLICY "Authenticated can read logs"
  ON public.ad_execution_logs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can read schedule" ON public.ad_schedule;
CREATE POLICY "Authenticated can read schedule"
  ON public.ad_schedule FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can read settings" ON public.radio_settings;
CREATE POLICY "Authenticated can read settings"
  ON public.radio_settings FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2. Replace permissive ALL policies with explicit policies
-- ============================================================
-- ads
DROP POLICY IF EXISTS "Authenticated can manage ads" ON public.ads;
CREATE POLICY "Authenticated can insert ads" ON public.ads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ads" ON public.ads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete ads" ON public.ads FOR DELETE TO authenticated USING (true);

-- advertisers
DROP POLICY IF EXISTS "Authenticated can manage advertisers" ON public.advertisers;
CREATE POLICY "Authenticated can insert advertisers" ON public.advertisers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update advertisers" ON public.advertisers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete advertisers" ON public.advertisers FOR DELETE TO authenticated USING (true);

-- ad_contracts
DROP POLICY IF EXISTS "Authenticated can manage contracts" ON public.ad_contracts;
CREATE POLICY "Authenticated can insert contracts" ON public.ad_contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update contracts" ON public.ad_contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete contracts" ON public.ad_contracts FOR DELETE TO authenticated USING (true);

-- ad_execution_logs
DROP POLICY IF EXISTS "Authenticated can manage logs" ON public.ad_execution_logs;
CREATE POLICY "Authenticated can insert logs" ON public.ad_execution_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update logs" ON public.ad_execution_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete logs" ON public.ad_execution_logs FOR DELETE TO authenticated USING (true);

-- ad_schedule
DROP POLICY IF EXISTS "Authenticated can manage schedule" ON public.ad_schedule;
CREATE POLICY "Authenticated can insert schedule" ON public.ad_schedule FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update schedule" ON public.ad_schedule FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete schedule" ON public.ad_schedule FOR DELETE TO authenticated USING (true);

-- radio_settings
DROP POLICY IF EXISTS "Authenticated can manage settings" ON public.radio_settings;
CREATE POLICY "Authenticated can insert settings" ON public.radio_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update settings" ON public.radio_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete settings" ON public.radio_settings FOR DELETE TO authenticated USING (true);

-- business_segments
DROP POLICY IF EXISTS "Authenticated can manage segments" ON public.business_segments;
CREATE POLICY "Authenticated can insert segments" ON public.business_segments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update segments" ON public.business_segments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete segments" ON public.business_segments FOR DELETE TO authenticated USING (true);

-- academy_settings
DROP POLICY IF EXISTS "Authenticated can manage academy settings" ON public.academy_settings;
CREATE POLICY "Authenticated can insert academy settings" ON public.academy_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update academy settings" ON public.academy_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete academy settings" ON public.academy_settings FOR DELETE TO authenticated USING (true);

-- class_schedule
DROP POLICY IF EXISTS "Authenticated can manage schedule" ON public.class_schedule;
CREATE POLICY "Authenticated can insert class schedule" ON public.class_schedule FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update class schedule" ON public.class_schedule FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete class schedule" ON public.class_schedule FOR DELETE TO authenticated USING (true);

-- employees
DROP POLICY IF EXISTS "Authenticated can manage employees" ON public.employees;
CREATE POLICY "Authenticated can insert employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update employees" ON public.employees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete employees" ON public.employees FOR DELETE TO authenticated USING (true);

-- ponto_records
DROP POLICY IF EXISTS "Authenticated can manage ponto" ON public.ponto_records;
CREATE POLICY "Authenticated can insert ponto" ON public.ponto_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ponto" ON public.ponto_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete ponto" ON public.ponto_records FOR DELETE TO authenticated USING (true);

-- radio_playlist
DROP POLICY IF EXISTS "Authenticated can manage playlist" ON public.radio_playlist;
CREATE POLICY "Authenticated can insert playlist" ON public.radio_playlist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update playlist" ON public.radio_playlist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete playlist" ON public.radio_playlist FOR DELETE TO authenticated USING (true);

-- whatsapp_conversations
DROP POLICY IF EXISTS "Authenticated users can manage conversations" ON public.whatsapp_conversations;
CREATE POLICY "Authenticated can read conversations" ON public.whatsapp_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert conversations" ON public.whatsapp_conversations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update conversations" ON public.whatsapp_conversations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete conversations" ON public.whatsapp_conversations FOR DELETE TO authenticated USING (true);

-- whatsapp_messages
DROP POLICY IF EXISTS "Authenticated users can manage messages" ON public.whatsapp_messages;
CREATE POLICY "Authenticated can read messages" ON public.whatsapp_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert messages" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update messages" ON public.whatsapp_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete messages" ON public.whatsapp_messages FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 3. Restrict listing of the public ad-audio bucket
-- Public read of individual files stays, but listing requires auth.
-- ============================================================
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN (
        'Public can read ad-audio',
        'Anyone can read ad-audio',
        'Public read ad-audio',
        'ad-audio public read'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Public single-object read (no listing). storage.foldername returning non-null
-- ensures the request targets a specific object key, not a list operation.
CREATE POLICY "ad-audio public object read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'ad-audio'
    AND name IS NOT NULL
    AND position('/' in name) >= 0
  );

-- Authenticated users can manage objects in ad-audio (insert/update/delete)
DROP POLICY IF EXISTS "Authenticated manage ad-audio" ON storage.objects;
CREATE POLICY "Authenticated insert ad-audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ad-audio');
CREATE POLICY "Authenticated update ad-audio" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'ad-audio') WITH CHECK (bucket_id = 'ad-audio');
CREATE POLICY "Authenticated delete ad-audio" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'ad-audio');
