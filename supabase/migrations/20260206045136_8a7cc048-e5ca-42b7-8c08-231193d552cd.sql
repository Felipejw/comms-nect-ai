
ALTER TABLE contacts ADD COLUMN name_source text DEFAULT 'auto';

-- Contatos com LID e sem phone vieram do pushName
UPDATE contacts SET name_source = 'pushname' 
WHERE whatsapp_lid IS NOT NULL 
  AND name IS NOT NULL 
  AND name != '' 
  AND name NOT LIKE 'Contato%';

-- Contatos com phone cujo nome parece ser um pushName real (nao numero)
UPDATE contacts SET name_source = 'pushname'
WHERE phone IS NOT NULL 
  AND name IS NOT NULL 
  AND name !~ '^\d[\d\s\-\+\(\)]+$'
  AND name NOT IN ('Contato Desconhecido', 'Chatbot Whats', 'Unknown')
  AND name NOT LIKE 'Contato #%';
