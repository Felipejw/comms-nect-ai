-- Add tenant_id to all remaining tables for multi-tenant data isolation

-- contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- campaign_contacts
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- tags
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- contact_tags
ALTER TABLE public.contact_tags ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- conversation_tags
ALTER TABLE public.conversation_tags ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- queues
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- queue_agents
ALTER TABLE public.queue_agents ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- quick_replies
ALTER TABLE public.quick_replies ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- kanban_columns
ALTER TABLE public.kanban_columns ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- chatbot_flows
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- chatbot_rules
ALTER TABLE public.chatbot_rules ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- flow_nodes
ALTER TABLE public.flow_nodes ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- flow_edges
ALTER TABLE public.flow_edges ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- schedules
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- connections
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- integrations
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- message_templates
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- google_calendar_events
ALTER TABLE public.google_calendar_events ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- ai_settings
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- api_keys
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- activity_logs
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- chat_messages
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Create indexes for better query performance on tenant_id
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON public.contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON public.conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON public.messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON public.campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tags_tenant ON public.tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_queues_tenant ON public.queues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flows_tenant ON public.chatbot_flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connections_tenant ON public.connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON public.schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_tenant ON public.quick_replies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant ON public.activity_logs(tenant_id);