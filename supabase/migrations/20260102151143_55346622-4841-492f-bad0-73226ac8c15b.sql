-- Add whatsapp_lid column to contacts table for LID tracking
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS whatsapp_lid TEXT;

-- Create index for faster LID lookups
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_lid ON public.contacts(whatsapp_lid);

-- Create storage bucket for WhatsApp media files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  52428800, -- 50MB limit
  ARRAY['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/opus', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/3gpp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for whatsapp-media bucket
CREATE POLICY "WhatsApp media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can upload WhatsApp media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can update WhatsApp media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can delete WhatsApp media"
ON storage.objects FOR DELETE
USING (bucket_id = 'whatsapp-media');