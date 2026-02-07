
-- ============================================================
-- MIGRATION: Remove Multi-Tenancy - Using CASCADE
-- ============================================================

-- STEP 1: Drop tenant_id columns with CASCADE (drops dependent policies automatically)
ALTER TABLE public.contacts DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.messages DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.tags DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.contact_tags DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.conversation_tags DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.campaign_contacts DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.quick_replies DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.schedules DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.connections DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.chatbot_rules DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.chatbot_flows DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.flow_nodes DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.flow_edges DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.integrations DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.ai_settings DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.api_keys DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.queues DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.queue_agents DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.kanban_columns DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.google_calendar_events DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.message_templates DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.activity_logs DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS tenant_id CASCADE;

-- STEP 2: Drop tenant-related tables
DROP TABLE IF EXISTS public.tenant_settings CASCADE;
DROP TABLE IF EXISTS public.subscription_payments CASCADE;
DROP TABLE IF EXISTS public.tenant_subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TABLE IF EXISTS public.sales CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

-- STEP 3: Drop tenant-related functions
DROP FUNCTION IF EXISTS public.get_user_tenant_id CASCADE;
DROP FUNCTION IF EXISTS public.can_access_tenant CASCADE;
DROP FUNCTION IF EXISTS public.tenant_has_active_subscription CASCADE;
DROP FUNCTION IF EXISTS public.get_tenant_plan_limits CASCADE;

-- STEP 4: Recreate all RLS policies (simplified, no tenant)

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
CREATE POLICY "Admins can view activity logs" ON public.activity_logs FOR SELECT USING (public.is_admin_or_manager(auth.uid()));

-- profiles
DROP POLICY IF EXISTS "Admins can view all profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());

-- system_settings
DROP POLICY IF EXISTS "Admins and managers can delete settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins and managers can insert settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins and managers can update settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins and managers can view settings" ON public.system_settings;
CREATE POLICY "Admins can manage system settings" ON public.system_settings FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- user_roles (keep existing)
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can view all roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view roles" ON public.user_roles FOR SELECT USING (auth.uid() IS NOT NULL);

-- user_permissions
DROP POLICY IF EXISTS "Admins can manage all permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_permissions;
CREATE POLICY "Admins can manage permissions" ON public.user_permissions FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own permissions" ON public.user_permissions FOR SELECT USING (user_id = auth.uid());

-- STEP 5: Update log_activity function (remove tenant_id reference)
CREATE OR REPLACE FUNCTION public.log_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_entity_type text;
  v_entity_id text;
  v_user_id uuid;
  v_metadata jsonb;
  v_row record;
BEGIN
  CASE TG_OP
    WHEN 'INSERT' THEN v_action := 'create';
    WHEN 'UPDATE' THEN v_action := 'update';
    WHEN 'DELETE' THEN v_action := 'delete';
    ELSE v_action := lower(TG_OP);
  END CASE;

  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN v_entity_type := 'contact';
    WHEN 'conversations' THEN v_entity_type := 'conversation';
    WHEN 'connections' THEN v_entity_type := 'connection';
    WHEN 'campaigns' THEN v_entity_type := 'campaign';
    WHEN 'tags' THEN v_entity_type := 'tag';
    WHEN 'quick_replies' THEN v_entity_type := 'quick_reply';
    WHEN 'chatbot_rules' THEN v_entity_type := 'chatbot_rule';
    ELSE v_entity_type := TG_TABLE_NAME;
  END CASE;

  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
  v_entity_id := v_row.id::text;
  v_user_id := auth.uid();
  v_metadata := '{}'::jsonb;

  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN
      IF TG_OP = 'INSERT' THEN v_metadata := jsonb_build_object('name', NEW.name, 'phone', NEW.phone);
      ELSIF TG_OP = 'UPDATE' THEN
        v_metadata := jsonb_build_object('name', NEW.name);
        IF OLD.status IS DISTINCT FROM NEW.status THEN v_metadata := v_metadata || jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status); END IF;
      ELSIF TG_OP = 'DELETE' THEN v_metadata := jsonb_build_object('name', OLD.name, 'phone', OLD.phone);
      END IF;
    WHEN 'conversations' THEN
      IF TG_OP = 'INSERT' THEN v_metadata := jsonb_build_object('status', NEW.status, 'contact_id', NEW.contact_id);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN v_metadata := jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
        ELSE RETURN v_row; END IF;
      END IF;
    WHEN 'connections' THEN
      IF TG_OP = 'INSERT' THEN v_metadata := jsonb_build_object('name', NEW.name, 'type', NEW.type);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN v_metadata := jsonb_build_object('name', NEW.name, 'old_status', OLD.status, 'new_status', NEW.status);
        ELSE RETURN v_row; END IF;
      ELSIF TG_OP = 'DELETE' THEN v_metadata := jsonb_build_object('name', OLD.name, 'type', OLD.type);
      END IF;
    WHEN 'campaigns' THEN
      IF TG_OP = 'INSERT' THEN v_metadata := jsonb_build_object('name', NEW.name, 'status', NEW.status);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN v_metadata := jsonb_build_object('name', NEW.name, 'old_status', OLD.status::text, 'new_status', NEW.status::text);
        ELSE RETURN v_row; END IF;
      END IF;
    WHEN 'tags' THEN v_metadata := jsonb_build_object('name', COALESCE(NEW.name, OLD.name), 'color', COALESCE(NEW.color, OLD.color));
    WHEN 'quick_replies' THEN v_metadata := jsonb_build_object('title', COALESCE(NEW.title, OLD.title), 'shortcut', COALESCE(NEW.shortcut, OLD.shortcut));
    WHEN 'chatbot_rules' THEN v_metadata := jsonb_build_object('trigger_text', COALESCE(NEW.trigger_text, OLD.trigger_text));
    ELSE v_metadata := '{}'::jsonb;
  END CASE;

  INSERT INTO public.activity_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES (v_action, v_entity_type, v_entity_id, v_user_id, v_metadata);
  RETURN v_row;
END;
$function$;
