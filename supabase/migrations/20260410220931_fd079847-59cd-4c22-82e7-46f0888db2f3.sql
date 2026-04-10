
-- Create storage bucket for ad audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-audio', 'ad-audio', true);

-- Allow public read access to ad audio files
CREATE POLICY "Public can read ad audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'ad-audio');

-- Allow authenticated users to upload ad audio
CREATE POLICY "Authenticated can upload ad audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ad-audio');

-- Allow authenticated users to update ad audio
CREATE POLICY "Authenticated can update ad audio"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'ad-audio');

-- Allow authenticated users to delete ad audio
CREATE POLICY "Authenticated can delete ad audio"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'ad-audio');
