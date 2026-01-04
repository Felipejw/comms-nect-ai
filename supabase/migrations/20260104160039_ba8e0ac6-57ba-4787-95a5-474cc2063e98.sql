-- Inserir configurações de branding na tabela system_settings
INSERT INTO system_settings (id, key, value, description, category) VALUES 
  (gen_random_uuid(), 'platform_name', 'TalkFlow', 'Nome da plataforma', 'branding'),
  (gen_random_uuid(), 'platform_logo', '', 'URL do logotipo da plataforma', 'branding'),
  (gen_random_uuid(), 'primary_color', '', 'Cor primária da plataforma (HSL)', 'branding'),
  (gen_random_uuid(), 'secondary_color', '', 'Cor secundária da plataforma (HSL)', 'branding')
ON CONFLICT (key) DO NOTHING;

-- Criar bucket para assets da plataforma (logos, etc)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('platform-assets', 'platform-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir leitura pública dos assets
CREATE POLICY "Platform assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'platform-assets');

-- Política para permitir upload por usuários autenticados
CREATE POLICY "Authenticated users can upload platform assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'platform-assets' AND auth.role() = 'authenticated');

-- Política para permitir update por usuários autenticados
CREATE POLICY "Authenticated users can update platform assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'platform-assets' AND auth.role() = 'authenticated');

-- Política para permitir delete por usuários autenticados
CREATE POLICY "Authenticated users can delete platform assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'platform-assets' AND auth.role() = 'authenticated');