-- Allow admins to delete messages (needed for conversation deletion)
CREATE POLICY "Admins can delete messages"
  ON public.messages
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add 'video' to message_type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'video' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'message_type')) THEN
    ALTER TYPE message_type ADD VALUE 'video';
  END IF;
END $$;