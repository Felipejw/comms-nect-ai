-- Adicionar política SELECT para system_settings permitindo leitura por todos os autenticados
-- (a política ALL existente para admins continua gerenciando INSERT/UPDATE/DELETE)
CREATE POLICY "Authenticated users can view system settings"
ON public.system_settings FOR SELECT
USING (auth.uid() IS NOT NULL);