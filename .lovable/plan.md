

# Fluxo Completo de Onboarding + Configuracao de Usuarios Existentes

## Visao Geral

O sistema atual tem toda a estrutura de multi-tenancy pronta (tabelas `tenants`, `tenant_subscriptions`, `profiles.tenant_id`), mas falta o fluxo automatico que conecta tudo. Atualmente:
- Nenhum tenant existe no banco de dados
- Todos os 4 usuarios tem `tenant_id = null`
- A funcao `handle_new_user` cria perfil e role, mas nao cria tenant

Este plano implementa:
1. Uma Edge Function que cria tenant automaticamente no signup
2. Uma pagina de onboarding pos-cadastro (nome da empresa + escolha de plano)
3. Configuracao dos usuarios existentes com um tenant principal

---

## Parte 1: Configurar Usuarios Existentes

Criar um tenant principal para o admin atual e associar todos os usuarios existentes a ele.

**Migracao SQL:**
- Inserir um tenant com `owner_user_id` do super admin (`33c631a4...`)
- Atualizar todos os perfis existentes para apontar para esse tenant
- Criar uma subscription trial para o tenant (plano Basico, 14 dias)

---

## Parte 2: Edge Function `setup-tenant`

Uma funcao backend que sera chamada apos o onboarding para:
1. Criar o registro na tabela `tenants`
2. Atualizar o `tenant_id` no perfil do usuario
3. Atualizar o role do usuario para `admin` (dono do tenant)
4. Criar uma subscription trial (14 dias, plano Basico)

A funcao recebe: `company_name`, `slug` (gerado automaticamente)

---

## Parte 3: Pagina de Onboarding

Nova pagina `/onboarding` com 2 etapas:

**Etapa 1 - Dados da Empresa:**
- Campo "Nome da sua empresa"
- Slug gerado automaticamente a partir do nome

**Etapa 2 - Escolha de Plano:**
- Exibir os 3 planos disponiveis (Basico, Profissional, Enterprise)
- Opcao de iniciar trial gratuito de 14 dias com o plano escolhido
- Botao "Comecar Trial Gratuito"

**Design:** Pagina limpa, similar ao login, com progresso visual (steps 1/2)

---

## Parte 4: Fluxo de Redirecionamento

Alterar a logica de redirecionamento no `AuthContext` e `Login.tsx`:

1. Apos login/signup, verificar se o usuario tem `tenant_id`
2. Se nao tem -> redirecionar para `/onboarding`
3. Se tem -> redirecionar para `/dashboard` (fluxo normal)

O `ProtectedRoute` tambem precisa verificar: se o usuario nao tem tenant, redireciona para onboarding em vez de mostrar a pagina protegida.

**Excecao:** Super Admin nao precisa de tenant para navegar.

---

## Detalhes Tecnicos

### Migracao SQL (usuarios existentes)

```text
-- 1. Criar tenant principal para o super admin
INSERT INTO tenants (name, slug, owner_user_id, plan, subscription_status, is_active)
VALUES ('Admin Principal', 'admin-principal', '33c631a4-a9c5-4623-85c2-eb7d604298df', 'basic', 'trial', true);

-- 2. Atualizar todos os perfis com o tenant_id
UPDATE profiles SET tenant_id = (SELECT id FROM tenants WHERE slug = 'admin-principal')
WHERE tenant_id IS NULL;

-- 3. Criar subscription trial (14 dias, plano Basico)
INSERT INTO tenant_subscriptions (tenant_id, plan_id, billing_cycle, status, current_period_end, trial_ends_at)
VALUES (
  (SELECT id FROM tenants WHERE slug = 'admin-principal'),
  '08fabb60-5fb9-466e-9dc2-17aca0df337d',
  'monthly',
  'active',
  now() + interval '14 days',
  now() + interval '14 days'
);
```

### Nova Edge Function: `setup-tenant`

- Recebe `{ company_name: string }` via POST
- Gera slug a partir do nome (sanitizado, lowercase, hifens)
- Verifica se slug ja existe (adiciona sufixo se necessario)
- Cria tenant, atualiza perfil com tenant_id, promove user para admin
- Cria subscription trial de 14 dias com plano Basico
- Retorna dados do tenant criado

### Nova pagina: `src/pages/Onboarding.tsx`

- Formulario com nome da empresa
- Cards de planos (reutilizando dados de `useSubscriptionPlans`)
- Botao que chama a edge function `setup-tenant`
- Apos sucesso: recarrega dados do usuario e redireciona para `/dashboard`

### Alteracoes em arquivos existentes:

| Arquivo | Alteracao |
|---------|-----------|
| `src/App.tsx` | Adicionar rota `/onboarding` |
| `src/contexts/AuthContext.tsx` | Expor `refreshUserData()` para recarregar apos onboarding |
| `src/components/auth/ProtectedRoute.tsx` | Se `profile.tenant_id` null e nao e super_admin, redirecionar para `/onboarding` |
| `src/pages/Login.tsx` | Apos login, verificar `tenant_id` antes de redirecionar |
| `supabase/functions/create-user/index.ts` | Copiar `tenant_id` do admin criador para o novo usuario |

### Edge Function `create-user` (ajuste)

Quando um admin cria um atendente, o novo usuario precisa herdar o `tenant_id` do admin. Adicionar logica para:
1. Buscar `tenant_id` do admin que esta criando
2. Atualizar o perfil do novo usuario com esse `tenant_id`

---

## Fluxo Completo (resumo visual)

```text
Novo usuario se cadastra
    |
    v
handle_new_user() cria perfil + role operator
    |
    v
Login -> verifica tenant_id = null
    |
    v
Redireciona para /onboarding
    |
    v
Preenche nome da empresa + escolhe plano
    |
    v
Edge Function setup-tenant:
  - Cria tenant
  - Atualiza perfil.tenant_id
  - Promove para admin
  - Cria subscription trial
    |
    v
Redireciona para /dashboard (fluxo normal)
```

Para atendentes criados por um admin:
```text
Admin usa pagina /usuarios -> Criar Atendente
    |
    v
Edge Function create-user:
  - Cria usuario no Auth
  - handle_new_user() cria perfil
  - Copia tenant_id do admin para o novo perfil
    |
    v
Atendente faz login -> ja tem tenant_id -> vai direto pro /dashboard
```

