-- Alterar o default de is_bot_active para true
ALTER TABLE conversations 
ALTER COLUMN is_bot_active SET DEFAULT true;