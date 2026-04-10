
-- Employees table
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Funcionário',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read employees" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ponto records table
CREATE TABLE public.ponto_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time TIME WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIME,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  within_radius BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'whatsapp',
  auto_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ponto_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ponto" ON public.ponto_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage ponto" ON public.ponto_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Class schedule table (weekly fixed grid)
CREATE TABLE public.class_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  class_name TEXT NOT NULL,
  instructor_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  instructor_name TEXT,
  max_capacity INTEGER DEFAULT 20,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read schedule" ON public.class_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage schedule" ON public.class_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_class_schedule_updated_at BEFORE UPDATE ON public.class_schedule
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Academy settings table
CREATE TABLE public.academy_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_name TEXT NOT NULL DEFAULT 'Minha Academia',
  lat DOUBLE PRECISION NOT NULL DEFAULT -23.5505,
  lng DOUBLE PRECISION NOT NULL DEFAULT -46.6333,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  operating_start TIME WITHOUT TIME ZONE NOT NULL DEFAULT '06:00',
  operating_end TIME WITHOUT TIME ZONE NOT NULL DEFAULT '22:00',
  auto_close_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read academy settings" ON public.academy_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage academy settings" ON public.academy_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_academy_settings_updated_at BEFORE UPDATE ON public.academy_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.academy_settings (academy_name) VALUES ('Minha Academia');
