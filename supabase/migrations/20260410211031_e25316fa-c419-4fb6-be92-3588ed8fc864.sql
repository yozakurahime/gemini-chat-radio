
-- Segments catalog
CREATE TABLE public.business_segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.business_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read segments" ON public.business_segments FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage segments" ON public.business_segments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Advertisers
CREATE TABLE public.advertisers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  segment_id UUID REFERENCES public.business_segments(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read advertisers" ON public.advertisers FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage advertisers" ON public.advertisers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon can manage advertisers" ON public.advertisers FOR ALL TO anon USING (true) WITH CHECK (true);

-- Contracts
CREATE TABLE public.ad_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser_id UUID NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL DEFAULT 'Padrão',
  value_cents INTEGER NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  daily_executions INTEGER NOT NULL DEFAULT 1,
  ad_duration_seconds INTEGER NOT NULL DEFAULT 30,
  contract_status TEXT NOT NULL DEFAULT 'active' CHECK (contract_status IN ('active','paused','expired','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid','pending','overdue')),
  segment_exclusive BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read contracts" ON public.ad_contracts FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage contracts" ON public.ad_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon can manage contracts" ON public.ad_contracts FOR ALL TO anon USING (true) WITH CHECK (true);

-- Ads
CREATE TABLE public.ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser_id UUID NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.ad_contracts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  audio_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  volume NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active','inactive','pending')),
  approved_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  allowed_hours_start TIME DEFAULT '06:00',
  allowed_hours_end TIME DEFAULT '23:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ads" ON public.ads FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage ads" ON public.ads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon can manage ads" ON public.ads FOR ALL TO anon USING (true) WITH CHECK (true);

-- Daily schedule
CREATE TABLE public.ad_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_date DATE NOT NULL DEFAULT CURRENT_DATE,
  scheduled_time TIME NOT NULL,
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.ad_contracts(id) ON DELETE SET NULL,
  execution_status TEXT NOT NULL DEFAULT 'pending' CHECK (execution_status IN ('pending','played','skipped','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read schedule" ON public.ad_schedule FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage schedule" ON public.ad_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon can manage schedule" ON public.ad_schedule FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE INDEX idx_ad_schedule_date ON public.ad_schedule(schedule_date, scheduled_time);

-- Execution logs
CREATE TABLE public.ad_execution_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_id UUID REFERENCES public.ads(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.ad_contracts(id) ON DELETE SET NULL,
  advertiser_id UUID REFERENCES public.advertisers(id) ON DELETE SET NULL,
  scheduled_time TIME,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actual_duration_seconds NUMERIC(6,2),
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read logs" ON public.ad_execution_logs FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage logs" ON public.ad_execution_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon can manage logs" ON public.ad_execution_logs FOR ALL TO anon USING (true) WITH CHECK (true);

-- Radio settings (singleton-ish)
CREATE TABLE public.radio_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  min_interval_minutes INTEGER NOT NULL DEFAULT 5,
  min_same_advertiser_interval_minutes INTEGER NOT NULL DEFAULT 15,
  operating_hours_start TIME NOT NULL DEFAULT '06:00',
  operating_hours_end TIME NOT NULL DEFAULT '22:00',
  prime_hours_start TIME DEFAULT '17:00',
  prime_hours_end TIME DEFAULT '20:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.radio_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read settings" ON public.radio_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage settings" ON public.radio_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_business_segments_updated_at BEFORE UPDATE ON public.business_segments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_advertisers_updated_at BEFORE UPDATE ON public.advertisers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ad_contracts_updated_at BEFORE UPDATE ON public.ad_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ads_updated_at BEFORE UPDATE ON public.ads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_radio_settings_updated_at BEFORE UPDATE ON public.radio_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.radio_settings (min_interval_minutes, min_same_advertiser_interval_minutes, operating_hours_start, operating_hours_end, prime_hours_start, prime_hours_end)
VALUES (5, 15, '06:00', '22:00', '17:00', '20:00');

-- Insert common segments
INSERT INTO public.business_segments (name) VALUES
('Suplementos'),
('Vestuário Fitness'),
('Fisioterapia'),
('Nutrição'),
('Estética'),
('Odontologia'),
('Barbearia'),
('Restaurante/Lanchonete'),
('Clínica Médica'),
('Outros');

-- Enable realtime for schedule
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_schedule;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_execution_logs;
