
-- WhatsApp session table (stores QR code and connection status)
CREATE TABLE public.whatsapp_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_name TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'qr_ready', 'connected', 'connecting')),
  qr_code TEXT,
  phone_number TEXT,
  connected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sessions"
ON public.whatsapp_sessions FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert sessions"
ON public.whatsapp_sessions FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update sessions"
ON public.whatsapp_sessions FOR UPDATE TO authenticated
USING (true);

-- Allow edge functions (anon key) to update session status
CREATE POLICY "Service can manage sessions"
ON public.whatsapp_sessions FOR ALL TO anon
USING (true) WITH CHECK (true);

-- Conversations table
CREATE TABLE public.whatsapp_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  last_message TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT true,
  assigned_to TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage conversations"
ON public.whatsapp_conversations FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Service can manage conversations"
ON public.whatsapp_conversations FOR ALL TO anon
USING (true) WITH CHECK (true);

-- Messages table
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'operator', 'ai')),
  media_url TEXT,
  is_ai_response BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage messages"
ON public.whatsapp_messages FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Service can manage messages"
ON public.whatsapp_messages FOR ALL TO anon
USING (true) WITH CHECK (true);

-- Enable realtime for conversations and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sessions;

-- Update timestamp function (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_whatsapp_sessions_updated_at
BEFORE UPDATE ON public.whatsapp_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_conversations_updated_at
BEFORE UPDATE ON public.whatsapp_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
