-- ============================================================
-- SISTEMA DE ATENDIMENTO - SCRIPT DE INICIALIZAÇÃO DO BANCO
-- ============================================================
-- Este arquivo consolida todas as migrations para instalação
-- em uma nova instância Supabase Self-Hosted
-- ============================================================

-- Criar schema para extensões (necessário para self-hosted)
CREATE SCHEMA IF NOT EXISTS extensions;

-- Extensões necessárias (compatíveis com PostgreSQL padrão)
-- NOTA: pg_graphql não está disponível em self-hosted, removido
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- ============================================================
-- PARTE 1: TIPOS ENUMERADOS (ENUMs)
-- ============================================================

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'manager',
    'operator'
);

CREATE TYPE public.campaign_status AS ENUM (
    'draft',
    'active',
    'paused',
    'completed'
);

CREATE TYPE public.contact_status AS ENUM (
    'active',
    'inactive'
);

CREATE TYPE public.conversation_status AS ENUM (
    'new',
    'in_progress',
    'resolved',
    'archived'
);

CREATE TYPE public.kanban_stage AS ENUM (
    'lead',
    'contacted',
    'proposal',
    'negotiation',
    'closed_won',
    'closed_lost'
);

CREATE TYPE public.message_type AS ENUM (
    'text',
    'image',
    'audio',
    'document',
    'video'
);

CREATE TYPE public.queue_status AS ENUM (
    'active',
    'paused'
);

CREATE TYPE public.schedule_status AS ENUM (
    'pending',
    'completed',
    'cancelled'
);

-- ============================================================
-- PARTE 2: FUNÇÕES AUXILIARES
-- ============================================================

-- Função para atualizar updated_at automaticamente
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Função para criar perfil e role quando usuário é criado
CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'operator');
  
  RETURN NEW;
END;
$$;

-- Função para verificar se usuário tem determinada role
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Função para verificar se usuário é admin ou manager
CREATE FUNCTION public.is_admin_or_manager(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'manager')
  )
$$;

-- Função para incrementar contador de uso de resposta rápida
CREATE FUNCTION public.increment_quick_reply_usage() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.usage_count = OLD.usage_count + 1;
  RETURN NEW;
END;
$$;

-- Função para atualizar última mensagem da conversa
CREATE FUNCTION public.update_conversation_last_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      unread_count = CASE 
        WHEN NEW.sender_type = 'contact' THEN unread_count + 1 
        ELSE unread_count 
      END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Função para atualizar último contato do contato
CREATE FUNCTION public.update_contact_last_contact() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.contacts
  SET last_contact_at = NEW.created_at
  WHERE id = (SELECT contact_id FROM public.conversations WHERE id = NEW.conversation_id);
  RETURN NEW;
END;
$$;

-- Função para prevenir contatos duplicados
CREATE FUNCTION public.prevent_duplicate_contacts()
RETURNS TRIGGER AS $$
DECLARE
  existing_contact_id UUID;
  clean_phone TEXT;
BEGIN
  IF NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;
  
  clean_phone := regexp_replace(NEW.phone, '\D', '', 'g');
  
  IF length(clean_phone) > 15 THEN
    NEW.whatsapp_lid := clean_phone;
    NEW.phone := NULL;
    RETURN NEW;
  END IF;
  
  SELECT id INTO existing_contact_id
  FROM public.contacts
  WHERE phone = clean_phone 
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
  
  IF existing_contact_id IS NOT NULL THEN
    IF NEW.whatsapp_lid IS NOT NULL THEN
      UPDATE public.contacts 
      SET whatsapp_lid = COALESCE(whatsapp_lid, NEW.whatsapp_lid),
          updated_at = now()
      WHERE id = existing_contact_id 
        AND whatsapp_lid IS NULL;
    END IF;
    RETURN NULL;
  END IF;
  
  IF NEW.whatsapp_lid IS NOT NULL THEN
    SELECT id INTO existing_contact_id
    FROM public.contacts
    WHERE phone = NEW.whatsapp_lid
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;
    
    IF existing_contact_id IS NOT NULL THEN
      UPDATE public.contacts 
      SET phone = NEW.phone,
          whatsapp_lid = NEW.whatsapp_lid,
          updated_at = now()
      WHERE id = existing_contact_id;
      RETURN NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- PARTE 3: TABELAS PRINCIPAIS
-- ============================================================

-- Tabela de roles de usuários
CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'operator'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(user_id, role)
);

-- Tabela de perfis de usuários
CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE,
    name text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    phone text,
    is_online boolean DEFAULT false,
    last_seen timestamp with time zone DEFAULT now(),
    signature_enabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de permissões de usuários
CREATE TABLE public.user_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    module text NOT NULL,
    can_view boolean DEFAULT true,
    can_edit boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(user_id, module)
);

-- Tabela de tags
CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    color text DEFAULT '#3B82F6'::text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de contatos
CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    email text,
    phone text,
    avatar_url text,
    company text,
    status public.contact_status DEFAULT 'active'::public.contact_status NOT NULL,
    notes text,
    kanban_stage public.kanban_stage DEFAULT 'lead'::public.kanban_stage,
    last_contact_at timestamp with time zone,
    whatsapp_lid text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de tags de contatos
CREATE TABLE public.contact_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(contact_id, tag_id)
);

-- Tabela de filas
CREATE TABLE public.queues (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    color text DEFAULT '#3B82F6'::text,
    status public.queue_status DEFAULT 'active'::public.queue_status NOT NULL,
    auto_assign boolean DEFAULT false,
    max_concurrent integer DEFAULT 5,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de agentes de filas
CREATE TABLE public.queue_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(queue_id, user_id)
);

-- Tabela de conexões (WhatsApp, etc)
CREATE TABLE public.connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    type text DEFAULT 'whatsapp'::text,
    status text DEFAULT 'disconnected'::text,
    phone_number text,
    qr_code text,
    session_data jsonb,
    is_default boolean DEFAULT false,
    disconnect_requested boolean DEFAULT false,
    color text DEFAULT '#22c55e',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'connecting'::text, 'error'::text]))),
    CONSTRAINT connections_type_check CHECK ((type = ANY (ARRAY['whatsapp'::text, 'telegram'::text, 'instagram'::text, 'messenger'::text, 'email'::text])))
);

-- Tabela de colunas do Kanban
CREATE TABLE public.kanban_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    color text DEFAULT '#3B82F6',
    position integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela de fluxos de chatbot
CREATE TABLE public.chatbot_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT false,
    trigger_type text DEFAULT 'keyword',
    trigger_value text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela de conversas
CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    assigned_to uuid,
    queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
    connection_id uuid REFERENCES public.connections(id),
    kanban_column_id uuid REFERENCES public.kanban_columns(id),
    active_flow_id uuid REFERENCES public.chatbot_flows(id) ON DELETE SET NULL,
    status public.conversation_status DEFAULT 'new'::public.conversation_status NOT NULL,
    subject text,
    channel text DEFAULT 'whatsapp'::text,
    priority integer DEFAULT 0,
    unread_count integer DEFAULT 0,
    is_bot_active boolean DEFAULT true,
    flow_state jsonb DEFAULT NULL,
    last_message_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de tags de conversas
CREATE TABLE public.conversation_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(conversation_id, tag_id)
);

-- Tabela de mensagens
CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id uuid,
    sender_type text DEFAULT 'agent'::text,
    content text NOT NULL,
    message_type public.message_type DEFAULT 'text'::public.message_type NOT NULL,
    media_url text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['agent'::text, 'contact'::text, 'bot'::text])))
);

-- Tabela de nós do fluxo
CREATE TABLE public.flow_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    flow_id uuid NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
    type text NOT NULL,
    position_x numeric DEFAULT 0,
    position_y numeric DEFAULT 0,
    data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de arestas do fluxo
CREATE TABLE public.flow_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    flow_id uuid NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
    source_id uuid NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
    target_id uuid NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de regras do chatbot
CREATE TABLE public.chatbot_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    trigger_text text NOT NULL,
    response text NOT NULL,
    match_type text DEFAULT 'contains'::text,
    is_active boolean DEFAULT true,
    priority integer DEFAULT 0,
    match_count integer DEFAULT 0,
    queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chatbot_rules_match_type_check CHECK ((match_type = ANY (ARRAY['exact'::text, 'contains'::text, 'starts_with'::text, 'regex'::text])))
);

-- Tabela de campanhas
CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    message text NOT NULL,
    media_url text,
    status public.campaign_status DEFAULT 'draft'::public.campaign_status NOT NULL,
    scheduled_at timestamp with time zone,
    sent_count integer DEFAULT 0,
    delivered_count integer DEFAULT 0,
    read_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de contatos de campanhas
CREATE TABLE public.campaign_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    status text DEFAULT 'pending'::text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(campaign_id, contact_id),
    CONSTRAINT campaign_contacts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);

-- Tabela de agendamentos
CREATE TABLE public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    message_content text,
    scheduled_at timestamp with time zone NOT NULL,
    status public.schedule_status DEFAULT 'pending'::public.schedule_status NOT NULL,
    reminder boolean DEFAULT true,
    reminder_sent boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de respostas rápidas
CREATE TABLE public.quick_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    shortcut text NOT NULL UNIQUE,
    title text NOT NULL,
    message text NOT NULL,
    category text,
    usage_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de integrações
CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT false,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de eventos do Google Calendar
CREATE TABLE public.google_calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
    google_event_id text NOT NULL,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status text DEFAULT 'confirmed',
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabela de configurações de IA
CREATE TABLE public.ai_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text DEFAULT 'Default'::text NOT NULL,
    system_prompt text DEFAULT 'Você é um assistente virtual amigável e prestativo.'::text,
    model text DEFAULT 'gpt-4o-mini'::text,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 500,
    is_enabled boolean DEFAULT true,
    knowledge_base text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de chaves de API
CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    permissions jsonb DEFAULT '["read"]'::jsonb,
    is_active boolean DEFAULT true,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de logs de atividade
CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de chat interno
CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de configurações do sistema
CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    key text UNIQUE NOT NULL,
    value text NOT NULL,
    description text,
    category text DEFAULT 'options',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- ============================================================
-- PARTE 4: ÍNDICES
-- ============================================================

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs USING btree (created_at);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs USING btree (user_id);
CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);
CREATE INDEX idx_chat_messages_sender_receiver ON public.chat_messages USING btree (sender_id, receiver_id);
CREATE INDEX idx_contacts_kanban_stage ON public.contacts USING btree (kanban_stage);
CREATE INDEX idx_contacts_status ON public.contacts USING btree (status);
CREATE INDEX idx_contacts_whatsapp_lid ON public.contacts USING btree (whatsapp_lid);
CREATE INDEX idx_conversations_assigned_to ON public.conversations USING btree (assigned_to);
CREATE INDEX idx_conversations_contact_id ON public.conversations USING btree (contact_id);
CREATE INDEX idx_conversations_status ON public.conversations USING btree (status);
CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at);
CREATE INDEX idx_schedules_scheduled_at ON public.schedules USING btree (scheduled_at);
CREATE INDEX idx_schedules_user_id ON public.schedules USING btree (user_id);
CREATE INDEX idx_google_calendar_events_integration ON public.google_calendar_events(integration_id);
CREATE INDEX idx_google_calendar_events_contact ON public.google_calendar_events(contact_id);
CREATE INDEX idx_google_calendar_events_conversation ON public.google_calendar_events(conversation_id);
CREATE INDEX idx_google_calendar_events_start_time ON public.google_calendar_events(start_time);

-- ============================================================
-- PARTE 5: TRIGGERS
-- ============================================================

-- Trigger para criar perfil quando usuário é criado
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Triggers para atualização de timestamp
CREATE TRIGGER update_ai_settings_updated_at BEFORE UPDATE ON public.ai_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_chatbot_flows_updated_at BEFORE UPDATE ON public.chatbot_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_chatbot_rules_updated_at BEFORE UPDATE ON public.chatbot_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_connections_updated_at BEFORE UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kanban_columns_updated_at BEFORE UPDATE ON public.kanban_columns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_queues_updated_at BEFORE UPDATE ON public.queues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_quick_replies_updated_at BEFORE UPDATE ON public.quick_replies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Triggers para mensagens
CREATE TRIGGER on_message_created AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();
CREATE TRIGGER on_message_update_contact AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_contact_last_contact();

-- Trigger para prevenir contatos duplicados
CREATE TRIGGER check_duplicate_contacts BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_contacts();

-- ============================================================
-- PARTE 6: HABILITAR RLS (Row Level Security)
-- ============================================================

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PARTE 7: POLÍTICAS RLS
-- ============================================================

-- activity_logs
CREATE POLICY "System can create activity logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can view own activity" ON public.activity_logs FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR is_admin_or_manager(auth.uid()));

-- ai_settings
CREATE POLICY "Admins can manage AI settings" ON public.ai_settings TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view AI settings" ON public.ai_settings FOR SELECT TO authenticated USING (true);

-- api_keys
CREATE POLICY "Admins can manage API keys" ON public.api_keys TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view API keys" ON public.api_keys FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- campaign_contacts
CREATE POLICY "Admins and managers can manage campaign contacts" ON public.campaign_contacts TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated users can view campaign contacts" ON public.campaign_contacts FOR SELECT TO authenticated USING (true);

-- campaigns
CREATE POLICY "Admins and managers can manage campaigns" ON public.campaigns TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated users can view campaigns" ON public.campaigns FOR SELECT TO authenticated USING (true);

-- chat_messages
CREATE POLICY "Users can send chat messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Users can update own chat messages" ON public.chat_messages FOR UPDATE TO authenticated USING ((sender_id = auth.uid()) OR (receiver_id = auth.uid()));
CREATE POLICY "Users can view own chat messages" ON public.chat_messages FOR SELECT TO authenticated USING ((sender_id = auth.uid()) OR (receiver_id = auth.uid()));

-- chatbot_flows
CREATE POLICY "Authenticated users can view flows" ON public.chatbot_flows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create flows" ON public.chatbot_flows FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY "Users can update own flows or admins" ON public.chatbot_flows FOR UPDATE TO authenticated USING (created_by = auth.uid() OR created_by IS NULL OR is_admin_or_manager(auth.uid()));
CREATE POLICY "Users can delete own flows or admins" ON public.chatbot_flows FOR DELETE TO authenticated USING (created_by = auth.uid() OR created_by IS NULL OR is_admin_or_manager(auth.uid()));

-- chatbot_rules
CREATE POLICY "Admins and managers can manage chatbot rules" ON public.chatbot_rules TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated users can view chatbot rules" ON public.chatbot_rules FOR SELECT TO authenticated USING (true);

-- connections
CREATE POLICY "Admins can manage connections" ON public.connections TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view connections" ON public.connections FOR SELECT TO authenticated USING (true);

-- contact_tags
CREATE POLICY "Authenticated users can manage contact tags" ON public.contact_tags TO authenticated USING (true);
CREATE POLICY "Authenticated users can view contact tags" ON public.contact_tags FOR SELECT TO authenticated USING (true);

-- contacts
CREATE POLICY "Authenticated users can create contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contacts" ON public.contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can view contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can delete contacts" ON public.contacts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- conversation_tags
CREATE POLICY "Authenticated users can view conversation tags" ON public.conversation_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage conversation tags" ON public.conversation_tags TO authenticated USING (true);

-- conversations
CREATE POLICY "Authenticated users can create conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update conversations" ON public.conversations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can view conversations" ON public.conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can delete conversations" ON public.conversations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- flow_edges
CREATE POLICY "Admins and managers can manage flow edges" ON public.flow_edges TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated users can view flow edges" ON public.flow_edges FOR SELECT TO authenticated USING (true);

-- flow_nodes
CREATE POLICY "Admins and managers can manage flow nodes" ON public.flow_nodes TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated users can view flow nodes" ON public.flow_nodes FOR SELECT TO authenticated USING (true);

-- google_calendar_events
CREATE POLICY "Allow authenticated users to view events" ON public.google_calendar_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert events" ON public.google_calendar_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update events" ON public.google_calendar_events FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to delete events" ON public.google_calendar_events FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow service role full access" ON public.google_calendar_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- integrations
CREATE POLICY "Admins can manage integrations" ON public.integrations TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view integrations" ON public.integrations FOR SELECT TO authenticated USING (true);

-- kanban_columns
CREATE POLICY "Authenticated users can view kanban columns" ON public.kanban_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage kanban columns" ON public.kanban_columns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- messages
CREATE POLICY "Authenticated users can create messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can view messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own messages" ON public.messages FOR UPDATE TO authenticated USING (sender_id = auth.uid());
CREATE POLICY "Admins can delete messages" ON public.messages FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- profiles
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);

-- queue_agents
CREATE POLICY "Admins and managers can manage queue agents" ON public.queue_agents TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Authenticated users can view queue agents" ON public.queue_agents FOR SELECT TO authenticated USING (true);

-- queues
CREATE POLICY "Authenticated users can view queues" ON public.queues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create queues" ON public.queues FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update queues" ON public.queues FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete queues" ON public.queues FOR DELETE TO authenticated USING (is_admin_or_manager(auth.uid()));

-- quick_replies
CREATE POLICY "Admins and managers can manage quick replies" ON public.quick_replies TO authenticated USING ((is_admin_or_manager(auth.uid()) OR (created_by = auth.uid())));
CREATE POLICY "Authenticated users can create quick replies" ON public.quick_replies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can view quick replies" ON public.quick_replies FOR SELECT TO authenticated USING (true);

-- schedules
CREATE POLICY "Users can create schedules" ON public.schedules FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own schedules" ON public.schedules FOR DELETE TO authenticated USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can update own schedules" ON public.schedules FOR UPDATE TO authenticated USING ((user_id = auth.uid()) OR is_admin_or_manager(auth.uid()));
CREATE POLICY "Users can view own schedules" ON public.schedules FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR is_admin_or_manager(auth.uid()));

-- system_settings
CREATE POLICY "Admins and managers can view settings" ON public.system_settings FOR SELECT TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can insert settings" ON public.system_settings FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update settings" ON public.system_settings FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can delete settings" ON public.system_settings FOR DELETE TO authenticated USING (is_admin_or_manager(auth.uid()));

-- tags
CREATE POLICY "Authenticated users can view tags" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create tags" ON public.tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update tags" ON public.tags FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete tags" ON public.tags FOR DELETE TO authenticated USING (true);

-- user_permissions
CREATE POLICY "Admins can manage all permissions" ON public.user_permissions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own permissions" ON public.user_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- user_roles
CREATE POLICY "Admins can manage roles" ON public.user_roles TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- ============================================================
-- PARTE 8: STORAGE BUCKETS
-- ============================================================

-- Bucket para anexos de chat
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Anyone can view chat attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Authenticated users can delete chat attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-attachments');

-- Bucket para mídia do WhatsApp
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  52428800,
  ARRAY['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/opus', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/3gpp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "WhatsApp media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can upload WhatsApp media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can update WhatsApp media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can delete WhatsApp media"
ON storage.objects FOR DELETE
USING (bucket_id = 'whatsapp-media');

-- Bucket para assets da plataforma
INSERT INTO storage.buckets (id, name, public) 
VALUES ('platform-assets', 'platform-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Platform assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'platform-assets');

CREATE POLICY "Authenticated users can upload platform assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'platform-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update platform assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'platform-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete platform assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'platform-assets' AND auth.role() = 'authenticated');

-- ============================================================
-- PARTE 9: REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tags;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- ============================================================
-- PARTE 10: DADOS INICIAIS
-- ============================================================

-- Colunas padrão do Kanban
INSERT INTO public.kanban_columns (name, color, position) VALUES
  ('Novo', '#3B82F6', 0),
  ('Em Atendimento', '#EAB308', 1),
  ('Aguardando', '#8B5CF6', 2),
  ('Concluído', '#22C55E', 3);

-- Configurações padrão do sistema
INSERT INTO public.system_settings (key, value, description, category) VALUES
  ('send_transfer_message', 'disabled', 'Enviar mensagem ao transferir setor/atendente', 'options'),
  ('allow_operator_signature', 'disabled', 'Permite atendente escolher enviar assinatura', 'options'),
  ('require_tag_to_close', 'disabled', 'Tag obrigatória para fechar ticket', 'options'),
  ('send_greeting_on_accept', 'disabled', 'Enviar saudação ao aceitar conversa', 'options'),
  ('accept_audio_all_conversations', 'enabled', 'Aceita receber áudio de todas conversas', 'options'),
  ('close_on_transfer', 'enabled', 'Fechar conversa ao transferir para outro setor', 'options'),
  ('random_operator_selection', 'disabled', 'Escolher atendente aleatório', 'options'),
  ('reject_whatsapp_calls', 'enabled', 'Informar que não aceita ligação no WhatsApp', 'options'),
  ('platform_name', 'TalkFlow', 'Nome da plataforma', 'branding'),
  ('platform_logo', '', 'URL do logotipo da plataforma', 'branding'),
  ('primary_color', '', 'Cor primária da plataforma (HSL)', 'branding'),
  ('secondary_color', '', 'Cor secundária da plataforma (HSL)', 'branding'),
  -- Configurações do Baileys (importante para self-hosted)
  ('baileys_server_url', 'http://baileys:3000', 'URL interna do servidor Baileys', 'baileys'),
  ('baileys_api_key', '', 'Chave de API do Baileys (será preenchida pelo install.sh)', 'baileys')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- FIM DO SCRIPT DE INICIALIZAÇÃO
-- ============================================================
