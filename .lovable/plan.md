

# Simplificacao: Remover Multi-Tenancy (Uma Unica Empresa)

## Por que isso resolve o problema

Hoje, **cada operacao de salvar** precisa informar o `tenant_id` (identificador da empresa). Quando isso nao vai junto, o banco bloqueia por seguranca. Isso eh a causa dos erros que voce esta vendo.

Removendo esse sistema, as operacoes de salvar passam a funcionar diretamente, sem precisar identificar empresa nenhuma.

## O que sera removido

- Tabelas: `tenants`, `tenant_settings`, `tenant_subscriptions`, `subscription_plans`, `subscription_payments`, `products`, `sales`
- Coluna `tenant_id` de todas as tabelas de dados (contacts, conversations, messages, tags, etc.)
- Paginas: Super Admin, Onboarding (configurar empresa)
- Componentes: SubscriptionBlocker, SuperAdminTenants, SuperAdminProducts, SuperAdminSales, SuperAdminPlans, SuperAdminStats
- Hooks: useTenant, useSubscription, useSales, useProducts
- Helper: `src/lib/tenant.ts` (getUserTenantId)
- Funcao de edge: setup-tenant
- Rota `/super-admin` e `/onboarding`

## O que sera mantido

- Sistema de **roles** (admin, manager, operator) - continua funcionando normalmente
- Sistema de **permissoes** por modulo - continua funcionando
- Todas as funcionalidades do sistema (atendimento, chatbot, campanhas, contatos, etc.)
- Autenticacao e login

## Passo a passo da implementacao

### 1. Banco de dados - Simplificar politicas RLS

Recriar todas as politicas de seguranca (RLS) sem referencia a `tenant_id`. Exemplo:

Antes:
```sql
CREATE POLICY "Users can view contacts" ON contacts 
  FOR SELECT USING (
    is_super_admin(auth.uid()) 
    OR tenant_id = get_user_tenant_id(auth.uid()) 
    OR tenant_id IS NULL
  );
```

Depois:
```sql
CREATE POLICY "Authenticated users can view contacts" ON contacts 
  FOR SELECT USING (auth.uid() IS NOT NULL);
```

Isso sera feito para todas as ~25 tabelas que usam tenant_id.

### 2. Banco de dados - Remover coluna tenant_id

Depois de atualizar as politicas, remover a coluna `tenant_id` das tabelas de dados:

```sql
ALTER TABLE contacts DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE messages DROP COLUMN IF EXISTS tenant_id;
-- ... e todas as outras
```

### 3. Banco de dados - Remover tabelas e funcoes de tenant

```sql
DROP TABLE IF EXISTS tenant_settings CASCADE;
DROP TABLE IF EXISTS subscription_payments CASCADE;
DROP TABLE IF EXISTS tenant_subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

DROP FUNCTION IF EXISTS get_user_tenant_id CASCADE;
DROP FUNCTION IF EXISTS can_access_tenant CASCADE;
DROP FUNCTION IF EXISTS tenant_has_active_subscription CASCADE;
DROP FUNCTION IF EXISTS get_tenant_plan_limits CASCADE;
```

### 4. Codigo - Remover tenant_id dos hooks de criacao

Arquivos que serao simplificados (remover chamada a `getUserTenantId`):
- `src/hooks/useContacts.ts`
- `src/hooks/useTags.ts`
- `src/hooks/useCampaigns.ts`
- `src/hooks/useSchedules.ts`
- `src/hooks/useQuickReplies.ts`
- `src/pages/Contatos.tsx` (importacao CSV)

Exemplo - antes:
```typescript
const tenant_id = await getUserTenantId();
const { data, error } = await supabase
  .from('contacts')
  .insert({ ...input, tenant_id });
```

Depois:
```typescript
const { data, error } = await supabase
  .from('contacts')
  .insert(input);
```

### 5. Codigo - Remover paginas e componentes de tenant

Arquivos a serem **deletados**:
- `src/pages/SuperAdmin.tsx`
- `src/pages/Onboarding.tsx`
- `src/components/superadmin/SuperAdminTenants.tsx`
- `src/components/superadmin/SuperAdminProducts.tsx`
- `src/components/superadmin/SuperAdminSales.tsx`
- `src/components/superadmin/SuperAdminStats.tsx`
- `src/components/superadmin/SuperAdminPlans.tsx`
- `src/components/subscription/SubscriptionBlocker.tsx`
- `src/components/auth/SuperAdminRoute.tsx`
- `src/hooks/useTenant.ts`
- `src/hooks/useSubscription.ts`
- `src/hooks/useProducts.ts`
- `src/hooks/useSales.ts`
- `src/lib/tenant.ts`
- `supabase/functions/setup-tenant/index.ts`

### 6. Codigo - Simplificar AuthContext

Remover do contexto de autenticacao:
- `tenant` (objeto do tenant)
- `isSuperAdmin` (nao ha mais super admin)
- Busca de dados do tenant
- Referencia a `profile.tenant_id`

O role "admin" passa a ser o papel mais alto (em vez de super_admin).

### 7. Codigo - Simplificar ProtectedRoute

Remover a verificacao de `tenant_id` que redireciona para onboarding:

```typescript
// REMOVER esta linha:
if (!isSuperAdmin && !profile?.tenant_id) {
  return <Navigate to="/onboarding" replace />;
}
```

### 8. Codigo - Atualizar rotas (App.tsx)

Remover as rotas:
- `/super-admin`
- `/onboarding`

### 9. Codigo - Atualizar sidebar

Remover o link "Super Admin" da barra lateral.

### 10. Deploy - Atualizar init.sql

Reescrever o `deploy/supabase/init.sql` sem as tabelas e politicas de tenant.

### 11. SQL para rodar na VPS

Sera fornecido um comando SQL completo para rodar na VPS que faz toda a migracao do banco existente.

## Resumo do impacto

| Item | Quantidade |
|------|-----------|
| Tabelas removidas | 7 |
| Colunas removidas | ~20 (tenant_id de cada tabela) |
| Arquivos deletados | ~15 |
| Arquivos modificados | ~15 |
| Funcoes SQL removidas | 4 |
| Politicas RLS reescritas | ~50 |

## Resultado final

- Salvar configuracoes vai funcionar sem erros
- Criar contatos, tags, campanhas, etc. vai funcionar sem erros
- O sistema fica mais simples e facil de manter
- Menos chances de bugs no futuro
- A VPS precisara rodar um script SQL unico para migrar

