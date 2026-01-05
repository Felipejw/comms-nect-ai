-- Add color column to connections table for visual identification
ALTER TABLE public.connections 
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#22c55e';