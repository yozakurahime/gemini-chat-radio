
-- Helper to drop and recreate SELECT policies restricted to admin/staff
-- access_members
DROP POLICY IF EXISTS "Authenticated can read access_members" ON public.access_members;
CREATE POLICY "Staff read access_members" ON public.access_members FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- access_blocklist
DROP POLICY IF EXISTS "Authenticated can read access_blocklist" ON public.access_blocklist;
CREATE POLICY "Staff read access_blocklist" ON public.access_blocklist FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- access_logs (SELECT and INSERT)
DROP POLICY IF EXISTS "Authenticated can read access_logs" ON public.access_logs;
DROP POLICY IF EXISTS "Authenticated can insert access_logs" ON public.access_logs;
CREATE POLICY "Staff read access_logs" ON public.access_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "Staff insert access_logs" ON public.access_logs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- member_payments
DROP POLICY IF EXISTS "Authenticated can read payments" ON public.member_payments;
CREATE POLICY "Staff read payments" ON public.member_payments FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- employees
DROP POLICY IF EXISTS "Authenticated can read employees" ON public.employees;
CREATE POLICY "Staff read employees" ON public.employees FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- ponto_records
DROP POLICY IF EXISTS "Authenticated can read ponto" ON public.ponto_records;
CREATE POLICY "Staff read ponto" ON public.ponto_records FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- whatsapp_conversations (SELECT + INSERT + UPDATE)
DROP POLICY IF EXISTS "Authenticated can read conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Authenticated can insert conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Authenticated can update conversations" ON public.whatsapp_conversations;
CREATE POLICY "Staff read conversations" ON public.whatsapp_conversations FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "Staff insert conversations" ON public.whatsapp_conversations FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "Staff update conversations" ON public.whatsapp_conversations FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- whatsapp_messages
DROP POLICY IF EXISTS "Authenticated can read messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Authenticated can insert messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Authenticated can update messages" ON public.whatsapp_messages;
CREATE POLICY "Staff read messages" ON public.whatsapp_messages FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "Staff insert messages" ON public.whatsapp_messages FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "Staff update messages" ON public.whatsapp_messages FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- whatsapp_outbox
DROP POLICY IF EXISTS "Auth read outbox" ON public.whatsapp_outbox;
CREATE POLICY "Staff read outbox" ON public.whatsapp_outbox FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- whatsapp_sessions: admin only
DROP POLICY IF EXISTS "Authenticated users can view sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Authenticated users can insert sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Authenticated users can update sessions" ON public.whatsapp_sessions;
CREATE POLICY "Admin read sessions" ON public.whatsapp_sessions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin insert sessions" ON public.whatsapp_sessions FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update sessions" ON public.whatsapp_sessions FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- academy_settings: restrict read to staff/admin (used for geofencing)
DROP POLICY IF EXISTS "Authenticated can read academy settings" ON public.academy_settings;
CREATE POLICY "Staff read academy settings" ON public.academy_settings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- advertisers: restrict read
DROP POLICY IF EXISTS "Authenticated can read advertisers" ON public.advertisers;
CREATE POLICY "Staff read advertisers" ON public.advertisers FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- ad_execution_logs: tighten insert
DROP POLICY IF EXISTS "Authenticated can insert logs" ON public.ad_execution_logs;
CREATE POLICY "Staff insert ad_logs" ON public.ad_execution_logs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Lock down callable helper functions (keep has_role for RLS)
REVOKE EXECUTE ON FUNCTION public.queue_whatsapp_message(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_members() FROM PUBLIC, anon, authenticated;

-- Neutralize previously-committed plaintext-password migration effect (no-op).
-- The original migration file is also being overwritten with a no-op.
