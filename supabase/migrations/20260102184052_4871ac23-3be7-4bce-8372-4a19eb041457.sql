-- Add connection_id column to conversations table
ALTER TABLE conversations 
ADD COLUMN connection_id UUID REFERENCES connections(id);