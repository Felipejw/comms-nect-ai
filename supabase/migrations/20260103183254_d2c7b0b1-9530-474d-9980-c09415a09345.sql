-- Create table to store Google Calendar events created via chatbot
CREATE TABLE public.google_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_google_calendar_events_integration ON public.google_calendar_events(integration_id);
CREATE INDEX idx_google_calendar_events_contact ON public.google_calendar_events(contact_id);
CREATE INDEX idx_google_calendar_events_conversation ON public.google_calendar_events(conversation_id);
CREATE INDEX idx_google_calendar_events_start_time ON public.google_calendar_events(start_time);

-- Enable RLS
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow all authenticated users to manage events
CREATE POLICY "Allow authenticated users to view events"
ON public.google_calendar_events
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert events"
ON public.google_calendar_events
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update events"
ON public.google_calendar_events
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to delete events"
ON public.google_calendar_events
FOR DELETE
TO authenticated
USING (true);

-- Allow service role full access (for edge functions)
CREATE POLICY "Allow service role full access"
ON public.google_calendar_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);