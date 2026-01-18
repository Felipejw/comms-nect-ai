-- =============================================
-- MULTI-TENANT RLS POLICIES UPDATE
-- Ensures complete data isolation by tenant_id
-- Super admins can access all data
-- Regular users can only access their tenant's data
-- =============================================

-- Drop existing policies and recreate with tenant isolation

-- =============================================
-- CONTACTS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can create contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can delete contacts" ON public.contacts;

CREATE POLICY "Users can view contacts from their tenant"
ON public.contacts FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can create contacts in their tenant"
ON public.contacts FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can update contacts in their tenant"
ON public.contacts FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can delete contacts in their tenant"
ON public.contacts FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND tenant_id = get_user_tenant_id(auth.uid()))
);

-- =============================================
-- CONVERSATIONS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Admins can delete conversations" ON public.conversations;

CREATE POLICY "Users can view conversations from their tenant"
ON public.conversations FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can create conversations in their tenant"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can update conversations in their tenant"
ON public.conversations FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can delete conversations in their tenant"
ON public.conversations FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND tenant_id = get_user_tenant_id(auth.uid()))
);

-- =============================================
-- MESSAGES TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can create messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can delete messages" ON public.messages;

CREATE POLICY "Users can view messages from their tenant"
ON public.messages FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can create messages in their tenant"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can update messages in their tenant"
ON public.messages FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can delete messages in their tenant"
ON public.messages FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND tenant_id = get_user_tenant_id(auth.uid()))
);

-- =============================================
-- CAMPAIGNS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admins and managers can manage campaigns" ON public.campaigns;

CREATE POLICY "Users can view campaigns from their tenant"
ON public.campaigns FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage campaigns in their tenant"
ON public.campaigns FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- CAMPAIGN_CONTACTS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view campaign contacts" ON public.campaign_contacts;
DROP POLICY IF EXISTS "Admins and managers can manage campaign contacts" ON public.campaign_contacts;

CREATE POLICY "Users can view campaign contacts from their tenant"
ON public.campaign_contacts FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage campaign contacts in their tenant"
ON public.campaign_contacts FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- TAGS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view tags" ON public.tags;
DROP POLICY IF EXISTS "Admins and managers can create tags" ON public.tags;
DROP POLICY IF EXISTS "Admins and managers can update tags" ON public.tags;
DROP POLICY IF EXISTS "Admins and managers can delete tags" ON public.tags;

CREATE POLICY "Users can view tags from their tenant"
ON public.tags FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage tags in their tenant"
ON public.tags FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- CONTACT_TAGS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view contact tags" ON public.contact_tags;
DROP POLICY IF EXISTS "Authenticated users can manage contact tags" ON public.contact_tags;

CREATE POLICY "Users can view contact tags from their tenant"
ON public.contact_tags FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can manage contact tags in their tenant"
ON public.contact_tags FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

-- =============================================
-- CONVERSATION_TAGS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view conversation tags" ON public.conversation_tags;
DROP POLICY IF EXISTS "Authenticated users can manage conversation tags" ON public.conversation_tags;

CREATE POLICY "Users can view conversation tags from their tenant"
ON public.conversation_tags FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can manage conversation tags in their tenant"
ON public.conversation_tags FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

-- =============================================
-- QUEUES TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view queues" ON public.queues;
DROP POLICY IF EXISTS "Admins and managers can create queues" ON public.queues;
DROP POLICY IF EXISTS "Admins and managers can update queues" ON public.queues;
DROP POLICY IF EXISTS "Authenticated users can delete queues" ON public.queues;

CREATE POLICY "Users can view queues from their tenant"
ON public.queues FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage queues in their tenant"
ON public.queues FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- QUEUE_AGENTS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view queue agents" ON public.queue_agents;
DROP POLICY IF EXISTS "Admins and managers can manage queue agents" ON public.queue_agents;

CREATE POLICY "Users can view queue agents from their tenant"
ON public.queue_agents FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage queue agents in their tenant"
ON public.queue_agents FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- QUICK_REPLIES TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view quick replies" ON public.quick_replies;
DROP POLICY IF EXISTS "Authenticated users can create quick replies" ON public.quick_replies;
DROP POLICY IF EXISTS "Admins and managers can manage quick replies" ON public.quick_replies;

CREATE POLICY "Users can view quick replies from their tenant"
ON public.quick_replies FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can create quick replies in their tenant"
ON public.quick_replies FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can manage quick replies in their tenant"
ON public.quick_replies FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
  OR created_by = auth.uid()
);

CREATE POLICY "Admins can delete quick replies in their tenant"
ON public.quick_replies FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
  OR created_by = auth.uid()
);

-- =============================================
-- KANBAN_COLUMNS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view kanban columns" ON public.kanban_columns;
DROP POLICY IF EXISTS "Admins and managers can manage kanban columns" ON public.kanban_columns;

CREATE POLICY "Users can view kanban columns from their tenant"
ON public.kanban_columns FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage kanban columns in their tenant"
ON public.kanban_columns FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- CHATBOT_FLOWS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view flows" ON public.chatbot_flows;
DROP POLICY IF EXISTS "Authenticated users can create flows" ON public.chatbot_flows;
DROP POLICY IF EXISTS "Users can update own flows or admins" ON public.chatbot_flows;
DROP POLICY IF EXISTS "Users can delete own flows or admins" ON public.chatbot_flows;

CREATE POLICY "Users can view flows from their tenant"
ON public.chatbot_flows FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can create flows in their tenant"
ON public.chatbot_flows FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can update flows in their tenant"
ON public.chatbot_flows FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
  AND (created_by = auth.uid() OR is_admin_or_manager(auth.uid()))
);

CREATE POLICY "Admins can delete flows in their tenant"
ON public.chatbot_flows FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR ((tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) 
      AND (created_by = auth.uid() OR is_admin_or_manager(auth.uid())))
);

-- =============================================
-- CHATBOT_RULES TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view chatbot rules" ON public.chatbot_rules;
DROP POLICY IF EXISTS "Admins and managers can manage chatbot rules" ON public.chatbot_rules;

CREATE POLICY "Users can view chatbot rules from their tenant"
ON public.chatbot_rules FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage chatbot rules in their tenant"
ON public.chatbot_rules FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- FLOW_NODES TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view flow nodes" ON public.flow_nodes;
DROP POLICY IF EXISTS "Admins and managers can manage flow nodes" ON public.flow_nodes;

CREATE POLICY "Users can view flow nodes from their tenant"
ON public.flow_nodes FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can manage flow nodes in their tenant"
ON public.flow_nodes FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

-- =============================================
-- FLOW_EDGES TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view flow edges" ON public.flow_edges;
DROP POLICY IF EXISTS "Admins and managers can manage flow edges" ON public.flow_edges;

CREATE POLICY "Users can view flow edges from their tenant"
ON public.flow_edges FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can manage flow edges in their tenant"
ON public.flow_edges FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

-- =============================================
-- SCHEDULES TABLE
-- =============================================
DROP POLICY IF EXISTS "Users can view own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can create schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can update own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can delete own schedules" ON public.schedules;

CREATE POLICY "Users can view schedules from their tenant"
ON public.schedules FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (
    (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
    AND (user_id = auth.uid() OR is_admin_or_manager(auth.uid()))
  )
);

CREATE POLICY "Users can create schedules in their tenant"
ON public.schedules FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
);

CREATE POLICY "Users can update schedules in their tenant"
ON public.schedules FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (
    (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
    AND (user_id = auth.uid() OR is_admin_or_manager(auth.uid()))
  )
);

CREATE POLICY "Users can delete schedules in their tenant"
ON public.schedules FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (
    (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  )
);

-- =============================================
-- CONNECTIONS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view connections" ON public.connections;
DROP POLICY IF EXISTS "Admins can manage connections" ON public.connections;

CREATE POLICY "Users can view connections from their tenant"
ON public.connections FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage connections in their tenant"
ON public.connections FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- INTEGRATIONS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view integrations" ON public.integrations;
DROP POLICY IF EXISTS "Admins can manage integrations" ON public.integrations;

CREATE POLICY "Users can view integrations from their tenant"
ON public.integrations FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage integrations in their tenant"
ON public.integrations FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- MESSAGE_TEMPLATES TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view all templates" ON public.message_templates;
DROP POLICY IF EXISTS "Authenticated users can create templates" ON public.message_templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON public.message_templates;
DROP POLICY IF EXISTS "Users can delete their own templates" ON public.message_templates;

CREATE POLICY "Users can view templates from their tenant"
ON public.message_templates FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can create templates in their tenant"
ON public.message_templates FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
);

CREATE POLICY "Users can update templates in their tenant"
ON public.message_templates FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (created_by = auth.uid() AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

CREATE POLICY "Users can delete templates in their tenant"
ON public.message_templates FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (created_by = auth.uid() AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- GOOGLE_CALENDAR_EVENTS TABLE
-- =============================================
DROP POLICY IF EXISTS "Allow authenticated users to view events" ON public.google_calendar_events;
DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.google_calendar_events;
DROP POLICY IF EXISTS "Authenticated users can update events" ON public.google_calendar_events;
DROP POLICY IF EXISTS "Authenticated users can delete events" ON public.google_calendar_events;

CREATE POLICY "Users can view calendar events from their tenant"
ON public.google_calendar_events FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can create calendar events in their tenant"
ON public.google_calendar_events FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can update calendar events in their tenant"
ON public.google_calendar_events FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Users can delete calendar events in their tenant"
ON public.google_calendar_events FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

-- =============================================
-- AI_SETTINGS TABLE
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view AI settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Admins can manage AI settings" ON public.ai_settings;

CREATE POLICY "Users can view AI settings from their tenant"
ON public.ai_settings FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR tenant_id IS NULL
);

CREATE POLICY "Admins can manage AI settings in their tenant"
ON public.ai_settings FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- API_KEYS TABLE
-- =============================================
DROP POLICY IF EXISTS "Admins can view API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can manage API keys" ON public.api_keys;

CREATE POLICY "Admins can view API keys from their tenant"
ON public.api_keys FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

CREATE POLICY "Admins can manage API keys in their tenant"
ON public.api_keys FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (has_role(auth.uid(), 'admin') AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))
);

-- =============================================
-- ACTIVITY_LOGS TABLE
-- =============================================
DROP POLICY IF EXISTS "Users can view own activity" ON public.activity_logs;
DROP POLICY IF EXISTS "System can create activity logs" ON public.activity_logs;

CREATE POLICY "Users can view activity logs from their tenant"
ON public.activity_logs FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (
    (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
    AND (user_id = auth.uid() OR is_admin_or_manager(auth.uid()))
  )
);

CREATE POLICY "System can create activity logs"
ON public.activity_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- =============================================
-- CHAT_MESSAGES TABLE (Internal Chat)
-- =============================================
DROP POLICY IF EXISTS "Users can view own chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can send chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update own chat messages" ON public.chat_messages;

CREATE POLICY "Users can view chat messages from their tenant"
ON public.chat_messages FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR (
    (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  )
);

CREATE POLICY "Users can send chat messages in their tenant"
ON public.chat_messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
);

CREATE POLICY "Users can update chat messages in their tenant"
ON public.chat_messages FOR UPDATE
TO authenticated
USING (
  (sender_id = auth.uid() OR receiver_id = auth.uid())
  AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)
);