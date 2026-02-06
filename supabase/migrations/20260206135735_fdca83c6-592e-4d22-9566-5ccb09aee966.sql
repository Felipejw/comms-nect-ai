
-- Add is_group column to contacts table
ALTER TABLE public.contacts ADD COLUMN is_group BOOLEAN DEFAULT false;

-- Update existing group contacts (numbers with 15+ digits are typically groups)
UPDATE public.contacts SET is_group = true WHERE length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) > 15;
