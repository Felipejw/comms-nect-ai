-- Add is_bot_active column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN is_bot_active BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.conversations.is_bot_active IS 'Indicates if the conversation is being handled by the chatbot';