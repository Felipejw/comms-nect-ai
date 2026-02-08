

# Diagnostico e Correcao Definitiva do RLS na VPS

## Situacao Atual

- GRANTs estao **corretos** (authenticated tem ALL em system_settings)
- Role do usuario esta **correto** (admin@admin.com = admin)
- Mas escritas continuam falhando com erro de RLS

## Causa Provavel

O `init.sql` cria as policies como PERMISSIVE (padrao do PostgreSQL). Porem, a migration `20260207180232` (que remove multi-tenancy) tambem cria policies - e se ambos rodaram no VPS, pode haver **policies duplicadas** ou a migration pode ter sido aplicada de forma que criou policies em cima de policies ja existentes, causando conflitos.

Outra possibilidade: a funcao `is_admin_or_manager()` nao esta reconhecendo o user ID do JWT, ou o JWT do usuario nao esta sendo decodificado corretamente pelo PostgREST.

## Passo 1: Diagnostico Completo (rodar na VPS)

Rode este comando para ver TODAS as policies da tabela `system_settings` e se sao permissive ou restrictive:

```text
sudo docker exec supabase-db psql -U postgres -c "
  SELECT 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
  FROM pg_policies 
  WHERE tablename = 'system_settings';
"
```

Se `permissive` mostrar `RESTRICTIVE` em vez de `PERMISSIVE`, essa e a causa.

## Passo 2: Testar a funcao is_admin_or_manager

```text
sudo docker exec supabase-db psql -U postgres -c "
  SELECT 
    ur.user_id,
    p.email,
    ur.role,
    public.is_admin_or_manager(ur.user_id) as is_admin_result,
    public.has_role(ur.user_id, 'admin'::app_role) as has_admin_result
  FROM user_roles ur 
  JOIN profiles p ON p.user_id = ur.user_id;
"
```

Se `is_admin_result` ou `has_admin_result` for `false`, a funcao esta com problema.

## Passo 3: Verificar se ha policies duplicadas

```text
sudo docker exec supabase-db psql -U postgres -c "
  SELECT tablename, policyname, permissive, cmd 
  FROM pg_policies 
  WHERE schemaname = 'public' 
  ORDER BY tablename, policyname;
"
```

## Passo 4: Correcao Nuclear (DROP + RECREATE todas as policies)

Se os diagnosticos mostrarem qualquer anomalia, rode este comando que apaga TODAS as policies e recria como PERMISSIVE:

```text
sudo docker exec supabase-db psql -U postgres <<'EOF'

-- Limpar TODAS as policies do schema public
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename FROM pg_policies 
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Recriar como PERMISSIVE (padrao)

-- profiles
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can view profiles" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);

-- contacts
CREATE POLICY "Authenticated users can view contacts" ON public.contacts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create contacts" ON public.contacts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update contacts" ON public.contacts FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can delete contacts" ON public.contacts FOR DELETE USING (public.is_admin_or_manager(auth.uid()));

-- conversations
CREATE POLICY "Authenticated users can view conversations" ON public.conversations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create conversations" ON public.conversations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update conversations" ON public.conversations FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can delete conversations" ON public.conversations FOR DELETE USING (public.is_admin_or_manager(auth.uid()));

-- messages
CREATE POLICY "Authenticated users can view messages" ON public.messages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update messages" ON public.messages FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can delete messages" ON public.messages FOR DELETE USING (public.is_admin_or_manager(auth.uid()));

-- tags
CREATE POLICY "Authenticated users can view tags" ON public.tags FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage tags" ON public.tags FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- contact_tags
CREATE POLICY "Authenticated users can manage contact tags" ON public.contact_tags FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- conversation_tags
CREATE POLICY "Authenticated users can manage conversation tags" ON public.conversation_tags FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- campaigns
CREATE POLICY "Authenticated users can view campaigns" ON public.campaigns FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage campaigns" ON public.campaigns FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- campaign_contacts
CREATE POLICY "Authenticated users can view campaign contacts" ON public.campaign_contacts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage campaign contacts" ON public.campaign_contacts FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- quick_replies
CREATE POLICY "Authenticated users can view quick replies" ON public.quick_replies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create quick replies" ON public.quick_replies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can manage own quick replies" ON public.quick_replies FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete own quick replies" ON public.quick_replies FOR DELETE USING (public.is_admin_or_manager(auth.uid()) OR created_by = auth.uid());

-- schedules
CREATE POLICY "Authenticated users can view schedules" ON public.schedules FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create schedules" ON public.schedules FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own schedules" ON public.schedules FOR UPDATE USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Users can delete own schedules" ON public.schedules FOR DELETE USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

-- connections
CREATE POLICY "Authenticated users can view connections" ON public.connections FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage connections" ON public.connections FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- chatbot_rules
CREATE POLICY "Authenticated users can view chatbot rules" ON public.chatbot_rules FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage chatbot rules" ON public.chatbot_rules FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- chatbot_flows
CREATE POLICY "Authenticated users can manage chatbot flows" ON public.chatbot_flows FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- flow_nodes
CREATE POLICY "Authenticated users can manage flow nodes" ON public.flow_nodes FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- flow_edges
CREATE POLICY "Authenticated users can manage flow edges" ON public.flow_edges FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- integrations
CREATE POLICY "Authenticated users can view integrations" ON public.integrations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage integrations" ON public.integrations FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ai_settings
CREATE POLICY "Authenticated users can view AI settings" ON public.ai_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage AI settings" ON public.ai_settings FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- api_keys
CREATE POLICY "Admins can manage API keys" ON public.api_keys FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- chat_messages
CREATE POLICY "Users can view own chat messages" ON public.chat_messages FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "Users can send chat messages" ON public.chat_messages FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Users can update own chat messages" ON public.chat_messages FOR UPDATE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- queues
CREATE POLICY "Authenticated users can view queues" ON public.queues FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage queues" ON public.queues FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- queue_agents
CREATE POLICY "Authenticated users can view queue agents" ON public.queue_agents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage queue agents" ON public.queue_agents FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- kanban_columns
CREATE POLICY "Authenticated users can view kanban columns" ON public.kanban_columns FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage kanban columns" ON public.kanban_columns FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- google_calendar_events
CREATE POLICY "Authenticated users can manage calendar events" ON public.google_calendar_events FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- message_templates
CREATE POLICY "Authenticated users can manage message templates" ON public.message_templates FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- activity_logs
CREATE POLICY "System can create activity logs" ON public.activity_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view activity logs" ON public.activity_logs FOR SELECT USING (public.is_admin_or_manager(auth.uid()));

-- system_settings
CREATE POLICY "Authenticated users can view system settings" ON public.system_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage system settings" ON public.system_settings FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- user_roles
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view roles" ON public.user_roles FOR SELECT USING (auth.uid() IS NOT NULL);

-- user_permissions
CREATE POLICY "Admins can manage permissions" ON public.user_permissions FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own permissions" ON public.user_permissions FOR SELECT USING (user_id = auth.uid());

-- Re-aplicar GRANTs
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon;

EOF
```

Apos rodar, reiniciar o PostgREST:

```text
cd /opt/sistema/deploy && sudo docker restart supabase-rest
```

## Por que isso deve funcionar

O comando acima:
1. Remove TODAS as policies existentes (eliminando duplicatas e policies restrictive)
2. Recria TODAS como PERMISSIVE (padrao do PostgreSQL quando nao se especifica AS RESTRICTIVE)
3. Reaplica os GRANTs para garantir permissoes completas
4. O restart do PostgREST forca o reload do schema

## Nenhuma mudanca de codigo necessaria

Todas as mudancas sao exclusivamente no banco de dados da VPS via terminal.

## Ordem dos comandos

1. Primeiro rode os diagnosticos (Passos 1-3) e me envie a saida
2. Se quiser pular o diagnostico, rode direto o Passo 4 (correcao nuclear)
3. Reinicie o PostgREST
4. Teste salvar config do Baileys e excluir contato

