-- House ads flag
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS is_house_ad boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ads_house ON public.ads(is_house_ad) WHERE is_house_ad = true;

-- Class notifications log (idempotency)
CREATE TABLE IF NOT EXISTS public.class_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.class_schedule(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  notification_date date NOT NULL DEFAULT CURRENT_DATE,
  minutes_before integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  UNIQUE (class_id, employee_id, notification_date, minutes_before)
);

ALTER TABLE public.class_notifications_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read class notifications"
  ON public.class_notifications_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert class notifications"
  ON public.class_notifications_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete class notifications"
  ON public.class_notifications_log FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_class_notif_date ON public.class_notifications_log(notification_date);