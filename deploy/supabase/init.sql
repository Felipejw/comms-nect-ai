-- ============================================================
-- SISTEMA DE ATENDIMENTO - SCRIPT DE INICIALIZAÇÃO DO BANCO
-- ============================================================
-- Versão sincronizada com o schema Cloud
-- Inclui: multi-tenancy, SaaS, subscriptions, todas as funções
-- ============================================================

-- Criar schema para extensões (necessário para self-hosted)
CREATE SCHEMA IF NOT EXISTS extensions;

-- Extensões necessárias (pg_stat_statements removido - pode não existir no container)
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- ============================================================
-- PARTE 1: TIPOS ENUMERADOS (ENUMs)
-- ============================================================

CREATE TYPE public.app_role AS ENUM (
    'super_admin',
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

-- Função para verificar se usuário é super admin
CREATE FUNCTION public.is_super_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
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
      AND role IN ('admin', 'manager', 'super_admin')
  )
$$;

-- Função para obter tenant_id do usuário
CREATE FUNCTION public.get_user_tenant_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT tenant_id
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Função para verificar se usuário pode acessar um tenant
CREATE FUNCTION public.can_access_tenant(_user_id uuid, _tenant_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    public.is_super_admin(_user_id) 
    OR public.get_user_tenant_id(_user_id) = _tenant_id
$$;

-- Função para obter limites do plano do tenant
CREATE FUNCTION public.get_tenant_plan_limits(_tenant_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(sp.limits, '{}'::jsonb)
  FROM public.tenant_subscriptions ts
  JOIN public.subscription_plans sp ON ts.plan_id = sp.id
  WHERE ts.tenant_id = _tenant_id
  AND ts.status IN ('active', 'past_due')
  LIMIT 1
$$;

-- Função para verificar se tenant tem subscription ativa
CREATE FUNCTION public.tenant_has_active_subscription(_tenant_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = _tenant_id
      AND t.is_active = true
      AND (
        t.subscription_status IN ('trial', 'active')
        OR (
          t.subscription_status = 'past_due' 
          AND t.subscription_expires_at + (t.grace_period_days || ' days')::interval > now()
        )
      )
  )
$$;

-- Função para normalizar telefone
CREATE FUNCTION public.normalize_phone(phone_input text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  clean_phone TEXT;
BEGIN
  IF phone_input IS NULL THEN
    RETURN NULL;
  END IF;
  
  clean_phone := regexp_replace(phone_input, '\D', '', 'g');
  
  IF length(clean_phone) > 15 THEN
    RETURN NULL;
  END IF;
  
  IF length(clean_phone) < 8 THEN
    RETURN NULL;
  END IF;
  
  RETURN clean_phone;
END;
$$;

-- Função para prevenir contatos duplicados
CREATE FUNCTION public.prevent_duplicate_contacts()
RETURNS TRIGGER AS $$
DECLARE
  existing_contact_id UUID;
  clean_phone TEXT;
  clean_lid TEXT;
BEGIN
  clean_phone := public.normalize_phone(NEW.phone);
  
  IF NEW.phone IS NOT NULL AND clean_phone IS NULL THEN
    clean_lid := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(clean_lid) >= 20 THEN
      NEW.whatsapp_lid := COALESCE(NEW.whatsapp_lid, clean_lid);
      NEW.phone := NULL;
    END IF;
  ELSE
    NEW.phone := clean_phone;
  END IF;
  
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    RETURN NEW;
  END IF;
  
  SELECT id INTO existing_contact_id
  FROM public.contacts
  WHERE phone = NEW.phone 
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
  
  IF existing_contact_id IS NOT NULL THEN
    IF NEW.whatsapp_lid IS NOT NULL THEN
      UPDATE public.contacts 
      SET whatsapp_lid = COALESCE(whatsapp_lid, NEW.whatsapp_lid),
          name = CASE 
            WHEN name IN ('Chatbot Whats', 'Contato Desconhecido') OR name ~ '^\d{14,}$' 
            THEN COALESCE(NULLIF(NEW.name, name), name)
            ELSE name
          END,
          updated_at = now()
      WHERE id = existing_contact_id;
    END IF;
    RETURN NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

-- Função para log de atividades
CREATE FUNCTION public.log_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_action text;
  v_entity_type text;
  v_entity_id text;
  v_tenant_id uuid;
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

  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  v_entity_id := v_row.id::text;
  v_tenant_id := v_row.tenant_id;
  v_user_id := auth.uid();
  v_metadata := '{}'::jsonb;

  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN
      IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('name', NEW.name, 'phone', NEW.phone);
      ELSIF TG_OP = 'UPDATE' THEN
        v_metadata := jsonb_build_object('name', NEW.name);
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          v_metadata := v_metadata || jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        v_metadata := jsonb_build_object('name', OLD.name, 'phone', OLD.phone);
      END IF;

    WHEN 'conversations' THEN
      IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('status', NEW.status, 'contact_id', NEW.contact_id);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          v_metadata := jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
        ELSE
          RETURN v_row;
        END IF;
      END IF;

    WHEN 'connections' THEN
      IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('name', NEW.name, 'type', NEW.type);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          v_metadata := jsonb_build_object('name', NEW.name, 'old_status', OLD.status, 'new_status', NEW.status);
        ELSE
          RETURN v_row;
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        v_metadata := jsonb_build_object('name', OLD.name, 'type', OLD.type);
      END IF;

    WHEN 'campaigns' THEN
      IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('name', NEW.name, 'status', NEW.status);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          v_metadata := jsonb_build_object('name', NEW.name, 'old_status', OLD.status::text, 'new_status', NEW.status::text);
        ELSE
          RETURN v_row;
        END IF;
      END IF;

    WHEN 'tags' THEN
      v_metadata := jsonb_build_object('name', COALESCE(NEW.name, OLD.name), 'color', COALESCE(NEW.color, OLD.color));

    WHEN 'quick_replies' THEN
      v_metadata := jsonb_build_object('title', COALESCE(NEW.title, OLD.title), 'shortcut', COALESCE(NEW.shortcut, OLD.shortcut));

    WHEN 'chatbot_rules' THEN
      v_metadata := jsonb_build_object('trigger_text', COALESCE(NEW.trigger_text, OLD.trigger_text));

    ELSE
      v_metadata := '{}'::jsonb;
  END CASE;

  INSERT INTO public.activity_logs (action, entity_type, entity_id, tenant_id, user_id, metadata)
  VALUES (v_action, v_entity_type, v_entity_id, v_tenant_id, v_user_id, v_metadata);

  RETURN v_row;
END;
$$;

-- Função para incrementar contagem de entregues em campanhas
CREATE FUNCTION public.increment_campaign_delivered(campaign_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE campaigns 
  SET delivered_count = COALESCE(delivered_count, 0) + 1
  WHERE id = campaign_id;
END;
$$;

-- Função para incrementar contagem de lidos em campanhas
CREATE FUNCTION public.increment_campaign_read(campaign_id uuid, was_delivered boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE campaigns 
  SET 
    read_count = COALESCE(read_count, 0) + 1,
    delivered_count = CASE 
      WHEN was_delivered THEN delivered_count 
      ELSE COALESCE(delivered_count, 0) + 1 
    END
  WHERE id = campaign_id;
END;
$$;

-- ============================================================
-- PARTE 3: TABELAS PRINCIPAIS
-- ============================================================

-- Tabela de tenants (empresas/clientes)
CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    owner_user_id uuid NOT NULL,
    plan text DEFAULT 'basic'::text,
    subscription_status text DEFAULT 'trial'::text,
    subscription_expires_at timestamp with time zone,
    grace_period_days integer DEFAULT 3,
    custom_domain text,
    affiliate_code text DEFAULT encode(extensions.gen_random_bytes(8), 'hex'::text),
    referred_by uuid,
    commission_rate numeric DEFAULT 50,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela de planos de assinatura
CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    price_monthly numeric DEFAULT 0 NOT NULL,
    price_yearly numeric DEFAULT 0 NOT NULL,
    features jsonb DEFAULT '[]'::jsonb,
    limits jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela de assinaturas dos tenants
CREATE TABLE public.tenant_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
    billing_cycle text DEFAULT 'monthly'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    current_period_start timestamp with time zone DEFAULT now() NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    trial_ends_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela de pagamentos
CREATE TABLE public.subscription_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    subscription_id uuid NOT NULL REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount numeric NOT NULL,
    currency text DEFAULT 'BRL'::text,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_method text,
    external_payment_id text,
    invoice_url text,
    due_date timestamp with time zone NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

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
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
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
    name_source text DEFAULT 'auto'::text,
    is_group boolean DEFAULT false,
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de tags de contatos
CREATE TABLE public.contact_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de agentes de filas
CREATE TABLE public.queue_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de colunas do Kanban
CREATE TABLE public.kanban_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    color text DEFAULT '#3B82F6',
    position integer DEFAULT 0,
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de tags de conversas
CREATE TABLE public.conversation_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de nós do fluxo
CREATE TABLE public.flow_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    flow_id uuid NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
    type text NOT NULL,
    position_x numeric DEFAULT 0,
    position_y numeric DEFAULT 0,
    data jsonb DEFAULT '{}'::jsonb,
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de arestas do fluxo
CREATE TABLE public.flow_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    flow_id uuid NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
    source_id uuid NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
    target_id uuid NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
    label text,
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de templates de mensagem
CREATE TABLE public.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    message text NOT NULL,
    media_type text,
    media_url text,
    tenant_id uuid REFERENCES public.tenants(id),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela de campanhas
CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    message text NOT NULL,
    media_url text,
    media_type text DEFAULT 'none'::text,
    status public.campaign_status DEFAULT 'draft'::public.campaign_status NOT NULL,
    scheduled_at timestamp with time zone,
    sent_count integer DEFAULT 0,
    delivered_count integer DEFAULT 0,
    read_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    use_variations boolean DEFAULT false,
    use_buttons boolean DEFAULT false,
    buttons jsonb DEFAULT '[]'::jsonb,
    min_interval integer DEFAULT 30,
    max_interval integer DEFAULT 60,
    message_variations text[] DEFAULT '{}'::text[],
    template_id uuid REFERENCES public.message_templates(id),
    created_by uuid,
    tenant_id uuid REFERENCES public.tenants(id),
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
    retry_count integer DEFAULT 0,
    next_retry_at timestamp with time zone,
    last_error text,
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(campaign_id, contact_id)
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
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de respostas rápidas
CREATE TABLE public.quick_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    shortcut text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    category text,
    usage_count integer DEFAULT 0,
    created_by uuid,
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
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
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de logs de atividade
CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de chat interno
CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    tenant_id uuid REFERENCES public.tenants(id),
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

-- Tabela de configurações por tenant
CREATE TABLE public.tenant_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    key text NOT NULL,
    value text NOT NULL,
    category text DEFAULT 'branding'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(tenant_id, key)
);

-- Tabela de produtos
CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    price numeric NOT NULL,
    features jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela de vendas
CREATE TABLE public.sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    product_id uuid REFERENCES public.products(id),
    seller_tenant_id uuid REFERENCES public.tenants(id),
    buyer_tenant_id uuid REFERENCES public.tenants(id),
    buyer_name text,
    buyer_email text,
    total_amount numeric NOT NULL,
    commission_amount numeric NOT NULL,
    status text DEFAULT 'pending'::text,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

-- ============================================================
-- PARTE 4: ÍNDICES
-- ============================================================

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs USING btree (created_at);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs USING btree (user_id);
CREATE INDEX idx_activity_logs_tenant_id ON public.activity_logs USING btree (tenant_id);
CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);
CREATE INDEX idx_campaigns_tenant_id ON public.campaigns USING btree (tenant_id);
CREATE INDEX idx_chat_messages_sender_receiver ON public.chat_messages USING btree (sender_id, receiver_id);
CREATE INDEX idx_chat_messages_tenant_id ON public.chat_messages USING btree (tenant_id);
CREATE INDEX idx_contacts_kanban_stage ON public.contacts USING btree (kanban_stage);
CREATE INDEX idx_contacts_status ON public.contacts USING btree (status);
CREATE INDEX idx_contacts_whatsapp_lid ON public.contacts USING btree (whatsapp_lid);
CREATE INDEX idx_contacts_tenant_id ON public.contacts USING btree (tenant_id);
CREATE INDEX idx_contacts_phone ON public.contacts USING btree (phone);
CREATE INDEX idx_conversations_assigned_to ON public.conversations USING btree (assigned_to);
CREATE INDEX idx_conversations_contact_id ON public.conversations USING btree (contact_id);
CREATE INDEX idx_conversations_status ON public.conversations USING btree (status);
CREATE INDEX idx_conversations_tenant_id ON public.conversations USING btree (tenant_id);
CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at);
CREATE INDEX idx_messages_tenant_id ON public.messages USING btree (tenant_id);
CREATE INDEX idx_schedules_scheduled_at ON public.schedules USING btree (scheduled_at);
CREATE INDEX idx_schedules_user_id ON public.schedules USING btree (user_id);
CREATE INDEX idx_schedules_tenant_id ON public.schedules USING btree (tenant_id);
CREATE INDEX idx_google_calendar_events_integration ON public.google_calendar_events(integration_id);
CREATE INDEX idx_google_calendar_events_contact ON public.google_calendar_events(contact_id);
CREATE INDEX idx_google_calendar_events_conversation ON public.google_calendar_events(conversation_id);
CREATE INDEX idx_google_calendar_events_start_time ON public.google_calendar_events(start_time);
CREATE INDEX idx_google_calendar_events_tenant_id ON public.google_calendar_events(tenant_id);
CREATE INDEX idx_tenants_slug ON public.tenants USING btree (slug);
CREATE INDEX idx_tenants_owner ON public.tenants USING btree (owner_user_id);
CREATE INDEX idx_tenant_subscriptions_tenant ON public.tenant_subscriptions USING btree (tenant_id);
CREATE INDEX idx_profiles_tenant_id ON public.profiles USING btree (tenant_id);
CREATE INDEX idx_connections_tenant_id ON public.connections USING btree (tenant_id);
CREATE INDEX idx_tags_tenant_id ON public.tags USING btree (tenant_id);
CREATE INDEX idx_queues_tenant_id ON public.queues USING btree (tenant_id);

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
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tenant_settings_updated_at BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PARTE 7: POLÍTICAS RLS (Tenant-Aware)
-- ============================================================

-- ---- tenants ----
CREATE POLICY "Super admins can manage all tenants" ON public.tenants FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Admins can view their own tenant" ON public.tenants FOR SELECT USING (owner_user_id = auth.uid());
CREATE POLICY "Admins can update their own tenant" ON public.tenants FOR UPDATE USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- ---- subscription_plans ----
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans FOR SELECT USING (is_active = true);
CREATE POLICY "Super admins can manage all plans" ON public.subscription_plans FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- ---- tenant_subscriptions ----
CREATE POLICY "Super admins can manage all subscriptions" ON public.tenant_subscriptions FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Tenants can view own subscription" ON public.tenant_subscriptions FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can update own tenant subscription" ON public.tenant_subscriptions FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid()));

-- ---- subscription_payments ----
CREATE POLICY "Super admins can manage all payments" ON public.subscription_payments FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Tenants can view own payments" ON public.subscription_payments FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()));

-- ---- tenant_settings ----
CREATE POLICY "Super admins can manage all tenant settings" ON public.tenant_settings FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Users can manage their tenant settings" ON public.tenant_settings FOR ALL USING (tenant_id = get_user_tenant_id(auth.uid())) WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- ---- products ----
CREATE POLICY "Everyone can view active products" ON public.products FOR SELECT USING (is_active = true);
CREATE POLICY "Super admins can manage products" ON public.products FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- ---- sales ----
CREATE POLICY "Super admins can manage all sales" ON public.sales FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Sellers can view their sales" ON public.sales FOR SELECT USING (seller_tenant_id = get_user_tenant_id(auth.uid()));

-- ---- message_templates ----
CREATE POLICY "Users can manage templates in their tenant" ON public.message_templates FOR ALL USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);

-- ---- profiles ----
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);

-- ---- user_roles ----
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view all roles" ON public.user_roles FOR SELECT USING (true);

-- ---- user_permissions ----
CREATE POLICY "Admins can manage all permissions" ON public.user_permissions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own permissions" ON public.user_permissions FOR SELECT USING (user_id = auth.uid());

-- ---- contacts ----
CREATE POLICY "Users can view contacts from their tenant" ON public.contacts FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can create contacts in their tenant" ON public.contacts FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can update contacts in their tenant" ON public.contacts FOR UPDATE USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can delete contacts in their tenant" ON public.contacts FOR DELETE USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

-- ---- contact_tags ----
CREATE POLICY "Users can view contact tags from their tenant" ON public.contact_tags FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can manage contact tags in their tenant" ON public.contact_tags FOR ALL USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);

-- ---- tags ----
CREATE POLICY "Users can view tags from their tenant" ON public.tags FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage tags in their tenant" ON public.tags FOR ALL USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- conversations ----
CREATE POLICY "Users can view conversations from their tenant" ON public.conversations FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can create conversations in their tenant" ON public.conversations FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can update conversations in their tenant" ON public.conversations FOR UPDATE USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can delete conversations in their tenant" ON public.conversations FOR DELETE USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

-- ---- conversation_tags ----
CREATE POLICY "Users can view conversation tags from their tenant" ON public.conversation_tags FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can manage conversation tags in their tenant" ON public.conversation_tags FOR ALL USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);

-- ---- messages ----
CREATE POLICY "Users can view messages from their tenant" ON public.messages FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can create messages in their tenant" ON public.messages FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can update messages in their tenant" ON public.messages FOR UPDATE USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can delete messages in their tenant" ON public.messages FOR DELETE USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

-- ---- connections ----
CREATE POLICY "Users can view connections from their tenant" ON public.connections FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage connections in their tenant" ON public.connections FOR ALL USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- queues ----
CREATE POLICY "Users can view queues from their tenant" ON public.queues FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage queues in their tenant" ON public.queues FOR ALL USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- queue_agents ----
CREATE POLICY "Users can view queue agents from their tenant" ON public.queue_agents FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage queue agents in their tenant" ON public.queue_agents FOR ALL USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- kanban_columns ----
CREATE POLICY "Users can view kanban columns from their tenant" ON public.kanban_columns FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage kanban columns in their tenant" ON public.kanban_columns FOR ALL USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- chatbot_flows ----
CREATE POLICY "Users can view flows from their tenant" ON public.chatbot_flows FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage flows in their tenant" ON public.chatbot_flows FOR ALL USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- chatbot_rules ----
CREATE POLICY "Users can view chatbot rules from their tenant" ON public.chatbot_rules FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage chatbot rules in their tenant" ON public.chatbot_rules FOR ALL USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- flow_nodes ----
CREATE POLICY "Users can view flow nodes from their tenant" ON public.flow_nodes FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can manage flow nodes in their tenant" ON public.flow_nodes FOR ALL USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);

-- ---- flow_edges ----
CREATE POLICY "Users can view flow edges from their tenant" ON public.flow_edges FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can manage flow edges in their tenant" ON public.flow_edges FOR ALL USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);

-- ---- campaigns ----
CREATE POLICY "Users can view campaigns from their tenant" ON public.campaigns FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage campaigns in their tenant" ON public.campaigns FOR ALL USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- campaign_contacts ----
CREATE POLICY "Users can view campaign contacts from their tenant" ON public.campaign_contacts FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage campaign contacts in their tenant" ON public.campaign_contacts FOR ALL USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- schedules ----
CREATE POLICY "Users can view schedules from their tenant" ON public.schedules FOR SELECT USING (is_super_admin(auth.uid()) OR ((tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) AND (user_id = auth.uid() OR is_admin_or_manager(auth.uid()))));
CREATE POLICY "Users can create schedules in their tenant" ON public.schedules FOR INSERT WITH CHECK (user_id = auth.uid() AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL));
CREATE POLICY "Users can update schedules in their tenant" ON public.schedules FOR UPDATE USING (is_super_admin(auth.uid()) OR ((tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) AND (user_id = auth.uid() OR is_admin_or_manager(auth.uid()))));
CREATE POLICY "Users can delete schedules in their tenant" ON public.schedules FOR DELETE USING (is_super_admin(auth.uid()) OR ((tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- ---- quick_replies ----
CREATE POLICY "Users can view quick replies from their tenant" ON public.quick_replies FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can create quick replies in their tenant" ON public.quick_replies FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can manage quick replies in their tenant" ON public.quick_replies FOR UPDATE USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)) OR created_by = auth.uid());
CREATE POLICY "Admins can delete quick replies in their tenant" ON public.quick_replies FOR DELETE USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)) OR created_by = auth.uid());

-- ---- integrations ----
CREATE POLICY "Users can view integrations from their tenant" ON public.integrations FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage integrations in their tenant" ON public.integrations FOR ALL USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- google_calendar_events ----
CREATE POLICY "Users can view calendar events from their tenant" ON public.google_calendar_events FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can create calendar events in their tenant" ON public.google_calendar_events FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can update calendar events in their tenant" ON public.google_calendar_events FOR UPDATE USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Users can delete calendar events in their tenant" ON public.google_calendar_events FOR DELETE USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);

-- ---- ai_settings ----
CREATE POLICY "Users can view AI settings from their tenant" ON public.ai_settings FOR SELECT USING (is_super_admin(auth.uid()) OR tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL);
CREATE POLICY "Admins can manage AI settings in their tenant" ON public.ai_settings FOR ALL USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- api_keys ----
CREATE POLICY "Admins can view API keys from their tenant" ON public.api_keys FOR SELECT USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));
CREATE POLICY "Admins can manage API keys in their tenant" ON public.api_keys FOR ALL USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL))) WITH CHECK (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- activity_logs ----
CREATE POLICY "System can create activity logs" ON public.activity_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view activity from their tenant" ON public.activity_logs FOR SELECT USING (is_super_admin(auth.uid()) OR (is_admin_or_manager(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL)));

-- ---- chat_messages ----
CREATE POLICY "Users can view chat messages from their tenant" ON public.chat_messages FOR SELECT USING (is_super_admin(auth.uid()) OR ((tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL) AND (sender_id = auth.uid() OR receiver_id = auth.uid())));
CREATE POLICY "Users can send chat messages in their tenant" ON public.chat_messages FOR INSERT WITH CHECK (sender_id = auth.uid() AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL));
CREATE POLICY "Users can update chat messages in their tenant" ON public.chat_messages FOR UPDATE USING ((sender_id = auth.uid() OR receiver_id = auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL));

-- ---- system_settings ----
CREATE POLICY "Admins and managers can view settings" ON public.system_settings FOR SELECT USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can insert settings" ON public.system_settings FOR INSERT WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can update settings" ON public.system_settings FOR UPDATE USING (is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins and managers can delete settings" ON public.system_settings FOR DELETE USING (is_admin_or_manager(auth.uid()));

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

-- Planos de assinatura
INSERT INTO public.subscription_plans (name, slug, description, price_monthly, price_yearly, features, limits, display_order) VALUES
  ('Básico', 'basico', 'Ideal para pequenas empresas', 97, 970, 
   '["3 usuários", "1 conexão WhatsApp", "500 contatos", "Chatbot básico", "Kanban"]'::jsonb,
   '{"max_users": 3, "max_connections": 1, "max_contacts": 500}'::jsonb, 1),
  ('Profissional', 'profissional', 'Para empresas em crescimento', 197, 1970, 
   '["10 usuários", "3 conexões WhatsApp", "5000 contatos", "Chatbot avançado", "Kanban", "Campanhas", "API"]'::jsonb,
   '{"max_users": 10, "max_connections": 3, "max_contacts": 5000}'::jsonb, 2),
  ('Enterprise', 'enterprise', 'Para grandes operações', 497, 4970, 
   '["Usuários ilimitados", "Conexões ilimitadas", "Contatos ilimitados", "Todos os recursos", "Suporte prioritário"]'::jsonb,
   '{"max_users": -1, "max_connections": -1, "max_contacts": -1}'::jsonb, 3);

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
  ('baileys_server_url', 'http://baileys:3000', 'URL interna do servidor Baileys', 'baileys'),
  ('baileys_api_key', '', 'Chave de API do Baileys (será preenchida pelo install.sh)', 'baileys')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- FIM DO SCRIPT DE INICIALIZAÇÃO
-- ============================================================
