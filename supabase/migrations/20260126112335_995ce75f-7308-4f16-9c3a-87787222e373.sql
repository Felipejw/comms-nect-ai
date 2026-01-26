-- =====================================================
-- SISTEMA DE ASSINATURAS SAAS
-- =====================================================

-- Tabela de planos de assinatura disponíveis
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  price_monthly numeric NOT NULL DEFAULT 0,
  price_yearly numeric NOT NULL DEFAULT 0,
  features jsonb DEFAULT '[]'::jsonb,
  limits jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de assinaturas dos tenants
CREATE TABLE public.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  cancelled_at timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  trial_ends_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Tabela de histórico de pagamentos
CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL,
  currency text DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  external_payment_id text,
  paid_at timestamptz,
  due_date timestamptz NOT NULL,
  invoice_url text,
  created_at timestamptz DEFAULT now()
);

-- Adicionar campos de assinatura na tabela tenants
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS grace_period_days integer DEFAULT 3;

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- subscription_plans: Todos podem ver planos ativos, Super Admin pode gerenciar
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "Super admins can manage all plans" ON public.subscription_plans
  FOR ALL USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- tenant_subscriptions: Tenant vê sua própria, Super Admin gerencia todas
CREATE POLICY "Tenants can view own subscription" ON public.tenant_subscriptions
  FOR SELECT USING (
    is_super_admin(auth.uid()) OR 
    tenant_id = get_user_tenant_id(auth.uid())
  );

CREATE POLICY "Super admins can manage all subscriptions" ON public.tenant_subscriptions
  FOR ALL USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Admins can update own tenant subscription" ON public.tenant_subscriptions
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin') AND 
    tenant_id = get_user_tenant_id(auth.uid())
  );

-- subscription_payments: Tenant vê seus pagamentos, Super Admin gerencia todos
CREATE POLICY "Tenants can view own payments" ON public.subscription_payments
  FOR SELECT USING (
    is_super_admin(auth.uid()) OR 
    tenant_id = get_user_tenant_id(auth.uid())
  );

CREATE POLICY "Super admins can manage all payments" ON public.subscription_payments
  FOR ALL USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- =====================================================
-- FUNÇÕES DE VERIFICAÇÃO
-- =====================================================

-- Função para verificar se tenant tem assinatura ativa
CREATE OR REPLACE FUNCTION public.tenant_has_active_subscription(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
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

-- Função para obter limites do plano do tenant
CREATE OR REPLACE FUNCTION public.get_tenant_plan_limits(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sp.limits, '{}'::jsonb)
  FROM public.tenant_subscriptions ts
  JOIN public.subscription_plans sp ON ts.plan_id = sp.id
  WHERE ts.tenant_id = _tenant_id
  AND ts.status IN ('active', 'past_due')
  LIMIT 1
$$;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- PLANOS PADRÃO
-- =====================================================

INSERT INTO public.subscription_plans (name, slug, description, price_monthly, price_yearly, features, limits, display_order) VALUES
(
  'Básico',
  'basic',
  'Ideal para pequenas empresas começando com WhatsApp',
  99.00,
  990.00,
  '["Atendimento via WhatsApp", "Histórico de conversas", "Contatos ilimitados no plano", "Suporte por email"]'::jsonb,
  '{"max_users": 3, "max_connections": 1, "max_contacts": 500, "max_campaigns_month": 5, "has_chatbot": false, "has_api_access": false}'::jsonb,
  1
),
(
  'Profissional',
  'pro',
  'Para equipes que precisam de mais recursos e automação',
  199.00,
  1990.00,
  '["Tudo do Básico", "Chatbot com fluxos", "Campanhas de disparo", "Relatórios avançados", "Suporte prioritário"]'::jsonb,
  '{"max_users": 10, "max_connections": 5, "max_contacts": 5000, "max_campaigns_month": 20, "has_chatbot": true, "has_api_access": false}'::jsonb,
  2
),
(
  'Enterprise',
  'enterprise',
  'Solução completa para grandes operações',
  499.00,
  4990.00,
  '["Tudo do Profissional", "Usuários ilimitados", "Conexões ilimitadas", "API de integração", "Chatbot com IA", "Gerente de conta dedicado"]'::jsonb,
  '{"max_users": -1, "max_connections": -1, "max_contacts": -1, "max_campaigns_month": -1, "has_chatbot": true, "has_api_access": true}'::jsonb,
  3
);