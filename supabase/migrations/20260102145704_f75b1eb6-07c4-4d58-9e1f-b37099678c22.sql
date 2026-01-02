-- Add signature_enabled column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS signature_enabled BOOLEAN DEFAULT false;