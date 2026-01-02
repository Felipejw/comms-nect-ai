-- Add message_content column to schedules table for automatic message sending
ALTER TABLE public.schedules 
ADD COLUMN IF NOT EXISTS message_content text;