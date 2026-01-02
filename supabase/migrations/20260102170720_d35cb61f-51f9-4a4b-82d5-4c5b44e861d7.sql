-- Add flow_state column to conversations to track menu waiting state
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS flow_state jsonb DEFAULT NULL;

COMMENT ON COLUMN public.conversations.flow_state IS 'Stores the current state of flow execution (waiting for menu response, current node, etc.)';