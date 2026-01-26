
# Plano: Sistema SaaS com Assinaturas e Controle de Acesso

## Visao Geral

Transformar o sistema atual em um SaaS completo com:
- Planos de assinatura (mensal/anual) com diferentes funcionalidades
- Controle automatico de acesso baseado no status do pagamento
- Sistema de cobranca com integração a gateway de pagamento
- Bloqueio de acesso para inadimplentes

---

## Arquitetura da Solucao

```text
+-----------------------------------------------------------------------+
|                    FLUXO DE ASSINATURA SAAS                           |
+-----------------------------------------------------------------------+
|                                                                       |
|  SUPER ADMIN                    TENANT (CLIENTE)                      |
|  +-----------------+            +---------------------------+         |
|  | Criar Planos    |            | Escolher Plano            |         |
|  | - Basico R$99   |            | Realizar Pagamento        |         |
|  | - Pro R$199     |  -------->  | Acessar Sistema           |         |
|  | - Enterprise    |            | (enquanto ativo)          |         |
|  +-----------------+            +---------------------------+         |
|                                          |                            |
|                                          v                            |
|                                 +---------------------------+         |
|                                 | subscription_expires_at   |         |
|                                 | < now() ?                 |         |
|                                 +---------------------------+         |
|                                    |              |                   |
|                                  SIM            NAO                   |
|                                    v              v                   |
|                            +-----------+  +--------------+            |
|                            | BLOQUEADO |  | ACESSO TOTAL |            |
|                            | Renovar   |  |              |            |
|                            +-----------+  +--------------+            |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## Parte 1: Novas Tabelas no Banco de Dados

### 1.1 Tabela `subscription_plans` (Planos Disponiveis)

```sql
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                      -- "Basico", "Pro", "Enterprise"
  slug text UNIQUE NOT NULL,               -- "basic", "pro", "enterprise"
  description text,
  price_monthly numeric NOT NULL,          -- Preco mensal
  price_yearly numeric NOT NULL,           -- Preco anual (com desconto)
  features jsonb DEFAULT '[]'::jsonb,      -- Lista de funcionalidades incluidas
  limits jsonb DEFAULT '{}'::jsonb,        -- Limites: max_users, max_connections, etc
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,         -- Ordem de exibicao
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Exemplo de limits:
-- {
--   "max_users": 5,
--   "max_connections": 2,
--   "max_contacts": 1000,
--   "max_campaigns_month": 10,
--   "has_chatbot": false,
--   "has_api_access": false
-- }
```

### 1.2 Tabela `tenant_subscriptions` (Assinaturas dos Tenants)

```sql
CREATE TABLE public.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly',  -- 'monthly' ou 'yearly'
  status text NOT NULL DEFAULT 'active',          -- 'active', 'past_due', 'cancelled', 'expired'
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,        -- Data de expiracao
  cancelled_at timestamptz,
  cancel_at_period_end boolean DEFAULT false,     -- Cancela no fim do periodo
  trial_ends_at timestamptz,                      -- Periodo de teste
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(tenant_id)  -- Um tenant so pode ter uma assinatura ativa
);
```

### 1.3 Tabela `subscription_payments` (Historico de Pagamentos)

```sql
CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL,
  currency text DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending',    -- 'pending', 'paid', 'failed', 'refunded'
  payment_method text,                        -- 'pix', 'credit_card', 'boleto'
  external_payment_id text,                   -- ID do gateway (Stripe, PagSeguro, etc)
  paid_at timestamptz,
  due_date timestamptz NOT NULL,
  invoice_url text,                           -- Link para fatura/boleto
  created_at timestamptz DEFAULT now()
);
```

### 1.4 Atualizar Tabela `tenants`

Adicionar campos para controle de assinatura:

```sql
ALTER TABLE public.tenants
ADD COLUMN subscription_status text DEFAULT 'trial',     -- 'trial', 'active', 'past_due', 'cancelled', 'expired'
ADD COLUMN subscription_expires_at timestamptz,          -- Data de expiracao do acesso
ADD COLUMN grace_period_days integer DEFAULT 3;          -- Dias de tolerancia apos vencimento
```

---

## Parte 2: Funcoes SQL para Verificacao de Acesso

### 2.1 Funcao para Verificar se Tenant tem Acesso

```sql
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
```

### 2.2 Funcao para Verificar Limites do Plano

```sql
CREATE OR REPLACE FUNCTION public.tenant_check_limit(_tenant_id uuid, _limit_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_limits jsonb;
  current_count integer;
BEGIN
  -- Buscar limites do plano atual
  SELECT sp.limits INTO plan_limits
  FROM public.tenant_subscriptions ts
  JOIN public.subscription_plans sp ON ts.plan_id = sp.id
  WHERE ts.tenant_id = _tenant_id
  AND ts.status = 'active';
  
  RETURN plan_limits->_limit_key;
END;
$$;
```

---

## Parte 3: Componentes Frontend

### 3.1 Hook `useSubscription.ts`

Novo hook para gerenciar assinaturas:

```typescript
// src/hooks/useSubscription.ts

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  limits: {
    max_users?: number;
    max_connections?: number;
    max_contacts?: number;
    max_campaigns_month?: number;
    has_chatbot?: boolean;
    has_api_access?: boolean;
  };
  is_active: boolean;
  display_order: number;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  billing_cycle: 'monthly' | 'yearly';
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  current_period_start: string;
  current_period_end: string;
  plan?: SubscriptionPlan;
}

// Hooks:
// - useSubscriptionPlans() - Lista planos disponiveis
// - useMySubscription() - Assinatura do tenant atual
// - useSubscriptionPayments() - Historico de pagamentos
// - useCreateSubscription() - Criar nova assinatura
// - useUpdateSubscription() - Upgrade/downgrade de plano
// - useCancelSubscription() - Cancelar assinatura
```

### 3.2 Componente `SubscriptionBlocker.tsx`

Componente que bloqueia acesso quando assinatura expira:

```typescript
// src/components/subscription/SubscriptionBlocker.tsx

// Exibe overlay de bloqueio quando:
// - subscription_status = 'expired'
// - subscription_expires_at < now() (fora do grace period)

// Permite:
// - Ver informacoes do plano atual
// - Renovar assinatura
// - Entrar em contato com suporte
```

### 3.3 Atualizar `PlansTab.tsx`

Implementar a aba de Planos que esta vazia:

```text
+---------------------------------------------------------------+
|  PLANOS E ASSINATURAS                                         |
+---------------------------------------------------------------+
|                                                               |
|  Seu Plano Atual: [PRO]                                       |
|  Status: Ativo                                                |
|  Proxima cobranca: 15/02/2026                                 |
|  Valor: R$ 199,00/mes                                         |
|                                                               |
|  [Ver Historico de Pagamentos]  [Mudar Plano]  [Cancelar]    |
|                                                               |
+---------------------------------------------------------------+
|                                                               |
|  PLANOS DISPONIVEIS                                           |
|                                                               |
|  +------------------+  +------------------+  +---------------+|
|  | BASICO           |  | PRO              |  | ENTERPRISE    ||
|  | R$ 99/mes        |  | R$ 199/mes       |  | R$ 499/mes    ||
|  |                  |  | (Atual)          |  |               ||
|  | - 3 usuarios     |  | - 10 usuarios    |  | - Ilimitado   ||
|  | - 1 conexao      |  | - 5 conexoes     |  | - Ilimitado   ||
|  | - 500 contatos   |  | - 5000 contatos  |  | - Ilimitado   ||
|  | - Sem chatbot    |  | - Chatbot        |  | - Chatbot IA  ||
|  |                  |  |                  |  | - API         ||
|  | [Downgrade]      |  | [Atual]          |  | [Upgrade]     ||
|  +------------------+  +------------------+  +---------------+|
|                                                               |
+---------------------------------------------------------------+
```

### 3.4 Super Admin: Gerenciamento de Planos

Nova aba no Super Admin para gerenciar planos:

```text
SUPER ADMIN > PLANOS

+---------------------------------------------------------------+
|  PLANOS DE ASSINATURA                         [+ Novo Plano]  |
+---------------------------------------------------------------+
| Nome       | Mensal   | Anual    | Assinantes | Status | Acao |
+---------------------------------------------------------------+
| Basico     | R$ 99    | R$ 990   | 45         | Ativo  | Edit |
| Pro        | R$ 199   | R$ 1.990 | 23         | Ativo  | Edit |
| Enterprise | R$ 499   | R$ 4.990 | 8          | Ativo  | Edit |
+---------------------------------------------------------------+
```

---

## Parte 4: Edge Functions

### 4.1 `check-subscription` - Verificar Status

Edge function chamada no login para verificar status:

```typescript
// supabase/functions/check-subscription/index.ts

// Verifica:
// - Se tenant tem assinatura ativa
// - Se esta dentro do periodo de graca
// - Retorna limites do plano atual
```

### 4.2 `process-subscription-payments` - Processar Pagamentos

Webhook/cron para processar pagamentos:

```typescript
// supabase/functions/process-subscription-payments/index.ts

// Executa diariamente:
// - Verifica assinaturas proximas do vencimento
// - Envia lembretes de pagamento (3 dias antes)
// - Marca como 'past_due' apos vencimento
// - Marca como 'expired' apos grace period
// - Atualiza subscription_status no tenant
```

### 4.3 `create-payment-link` - Gerar Link de Pagamento

```typescript
// supabase/functions/create-payment-link/index.ts

// Gera link de pagamento para:
// - Nova assinatura
// - Renovacao
// - Upgrade de plano
// Suporta: PIX, Boleto, Cartao
```

---

## Parte 5: Controle de Acesso por Assinatura

### 5.1 Atualizar `AuthContext.tsx`

Adicionar verificacao de assinatura:

```typescript
interface AuthContextType {
  // ... campos existentes
  subscription: TenantSubscription | null;
  hasActiveSubscription: boolean;
  isSubscriptionExpired: boolean;
  subscriptionLimits: SubscriptionLimits | null;
  checkLimit: (key: string) => boolean;
}
```

### 5.2 Atualizar `ProtectedRoute.tsx`

Adicionar verificacao de assinatura antes de permitir acesso:

```typescript
// Se assinatura expirada e fora do grace period:
// - Redirecionar para pagina de renovacao
// - Ou mostrar overlay de bloqueio

// Verificar limites do plano:
// - Se excedeu max_users, bloquear novos usuarios
// - Se excedeu max_connections, bloquear novas conexoes
```

---

## Parte 6: Integracao com Gateway de Pagamento

### Opcoes de Gateway

| Gateway    | PIX | Boleto | Cartao | Recorrencia | Webhooks |
|------------|-----|--------|--------|-------------|----------|
| Stripe     | Sim | Nao    | Sim    | Sim         | Sim      |
| PagSeguro  | Sim | Sim    | Sim    | Sim         | Sim      |
| Mercado Pago| Sim | Sim   | Sim    | Sim         | Sim      |
| Asaas      | Sim | Sim    | Sim    | Sim         | Sim      |

**Recomendacao:** Comecar com Stripe (mais simples) ou Asaas (mais brasileiro).

### 6.1 Webhook de Pagamento

```typescript
// supabase/functions/payment-webhook/index.ts

// Recebe eventos do gateway:
// - payment.succeeded -> Ativar/renovar assinatura
// - payment.failed -> Marcar como past_due
// - subscription.cancelled -> Marcar como cancelled
```

---

## Parte 7: RLS Policies para Novas Tabelas

### 7.1 subscription_plans

```sql
-- Todos podem ver planos ativos
CREATE POLICY "Anyone can view active plans" ON subscription_plans
  FOR SELECT USING (is_active = true);

-- Super Admin pode gerenciar
CREATE POLICY "Super admins can manage plans" ON subscription_plans
  FOR ALL USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
```

### 7.2 tenant_subscriptions

```sql
-- Tenant pode ver sua propria assinatura
CREATE POLICY "Tenants can view own subscription" ON tenant_subscriptions
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Super Admin pode gerenciar todas
CREATE POLICY "Super admins can manage all subscriptions" ON tenant_subscriptions
  FOR ALL USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
```

---

## Resumo das Alteracoes

| Componente | Acao | Descricao |
|------------|------|-----------|
| **Banco de Dados** | | |
| `subscription_plans` | Criar | Tabela de planos disponiveis |
| `tenant_subscriptions` | Criar | Assinaturas dos tenants |
| `subscription_payments` | Criar | Historico de pagamentos |
| `tenants` | Alterar | Adicionar campos de assinatura |
| `tenant_has_active_subscription()` | Criar | Funcao de verificacao |
| **Frontend** | | |
| `useSubscription.ts` | Criar | Hook de assinaturas |
| `SubscriptionBlocker.tsx` | Criar | Bloqueio de acesso |
| `PlansTab.tsx` | Modificar | Implementar aba de planos |
| `SuperAdminPlans.tsx` | Criar | Gerenciar planos (Super Admin) |
| `AuthContext.tsx` | Modificar | Adicionar verificacao de assinatura |
| `ProtectedRoute.tsx` | Modificar | Verificar status de assinatura |
| **Edge Functions** | | |
| `check-subscription` | Criar | Verificar status |
| `process-subscription-payments` | Criar | Processar pagamentos |
| `create-payment-link` | Criar | Gerar link de pagamento |
| `payment-webhook` | Criar | Receber webhooks do gateway |

---

## Proximo Passo: Gateway de Pagamento

Antes de implementar, preciso saber qual gateway de pagamento deseja utilizar para integrar com o sistema de cobranca. As opcoes mais comuns sao:

1. **Stripe** - Mais popular internacionalmente, facil integracao
2. **PagSeguro** - Popular no Brasil, suporta PIX e boleto
3. **Mercado Pago** - Muito usado no Brasil
4. **Asaas** - Focado em recorrencia, bom para SaaS brasileiro
