-- Adicionar campo para controlar desconexão intencional
ALTER TABLE connections 
ADD COLUMN IF NOT EXISTS disconnect_requested boolean DEFAULT false;