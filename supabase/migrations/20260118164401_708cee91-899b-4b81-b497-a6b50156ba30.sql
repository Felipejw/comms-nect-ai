-- =============================================
-- FASE 1B: ESTRUTURA MULTI-TENANT (Tabelas e Funções)
-- =============================================

-- 1. Criar tabela de tenants (organizações/clientes)
CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    custom_domain text UNIQUE,
    owner_user_id uuid NOT NULL,
    plan text DEFAULT 'basic',
    is_active boolean DEFAULT true,
    affiliate_code text UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
    referred_by uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
    commission_rate decimal DEFAULT 50,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Criar tabela de configurações por tenant
CREATE TABLE public.tenant_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    key text NOT NULL,
    value text NOT NULL,
    category text DEFAULT 'branding',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, key)
);

-- 3. Criar tabela de produtos para revenda
CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    price decimal NOT NULL,
    is_active boolean DEFAULT true,
    features jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. Criar tabela de vendas/comissões
CREATE TABLE public.sales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    seller_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
    buyer_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
    buyer_name text,
    buyer_email text,
    total_amount decimal NOT NULL,
    commission_amount decimal NOT NULL,
    status text DEFAULT 'pending',
    paid_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- 5. Adicionar tenant_id à tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

-- 6. Criar função para verificar se é super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- 7. Criar função para obter tenant_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 8. Criar função para verificar acesso ao tenant
CREATE OR REPLACE FUNCTION public.can_access_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_super_admin(_user_id) 
    OR public.get_user_tenant_id(_user_id) = _tenant_id
$$;

-- 9. Habilitar RLS nas novas tabelas
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- 10. Políticas RLS para tenants
CREATE POLICY "Super admins can manage all tenants"
ON public.tenants FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can view their own tenant"
ON public.tenants FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "Admins can update their own tenant"
ON public.tenants FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- 11. Políticas RLS para tenant_settings
CREATE POLICY "Super admins can manage all tenant settings"
ON public.tenant_settings FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can manage their tenant settings"
ON public.tenant_settings FOR ALL
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()))
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 12. Políticas RLS para products
CREATE POLICY "Super admins can manage products"
ON public.products FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Everyone can view active products"
ON public.products FOR SELECT
TO authenticated
USING (is_active = true);

-- 13. Políticas RLS para sales
CREATE POLICY "Super admins can manage all sales"
ON public.sales FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Sellers can view their sales"
ON public.sales FOR SELECT
TO authenticated
USING (seller_tenant_id = public.get_user_tenant_id(auth.uid()));

-- 14. Criar triggers de updated_at
CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_settings_updated_at
BEFORE UPDATE ON public.tenant_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 15. Inserir produto padrão "Gatteflow"
INSERT INTO public.products (name, description, price, features)
VALUES (
    'Gatteflow',
    'Sistema completo de atendimento WhatsApp com chatbot, CRM e automações',
    997.00,
    '["Atendimento WhatsApp", "Chatbot Visual", "CRM Kanban", "Campanhas", "Multi-atendentes", "Relatórios", "White Label"]'::jsonb
);

-- 16. Criar índices para performance
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_tenant_settings_tenant_id ON public.tenant_settings(tenant_id);
CREATE INDEX idx_sales_seller_tenant_id ON public.sales(seller_tenant_id);
CREATE INDEX idx_sales_status ON public.sales(status);
CREATE INDEX idx_tenants_slug ON public.tenants(slug);
CREATE INDEX idx_tenants_custom_domain ON public.tenants(custom_domain);