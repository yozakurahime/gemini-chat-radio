
-- Remove anon ALL policies from radio tables
DROP POLICY IF EXISTS "Anon can manage contracts" ON ad_contracts;
DROP POLICY IF EXISTS "Anon can manage logs" ON ad_execution_logs;
DROP POLICY IF EXISTS "Anon can manage schedule" ON ad_schedule;
DROP POLICY IF EXISTS "Anon can manage ads" ON ads;
DROP POLICY IF EXISTS "Anon can manage advertisers" ON advertisers;

-- Remove anon ALL policies from whatsapp tables
DROP POLICY IF EXISTS "Service can manage conversations" ON whatsapp_conversations;
DROP POLICY IF EXISTS "Service can manage messages" ON whatsapp_messages;
DROP POLICY IF EXISTS "Service can manage sessions" ON whatsapp_sessions;
