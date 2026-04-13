
-- Create radio_playlist table
CREATE TABLE public.radio_playlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Nova música',
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.radio_playlist ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated can read playlist"
  ON public.radio_playlist FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can manage playlist"
  ON public.radio_playlist FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_radio_playlist_updated_at
  BEFORE UPDATE ON public.radio_playlist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
