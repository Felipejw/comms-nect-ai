

# Ajuste Completo do Sistema para VPS (Sem Super Admin, Sem Tenant)

## Resumo

O sistema ainda tem restos do modelo multi-tenant em 3 areas:
1. **Scripts de deploy** (`install-unified.sh`, `repair-auth.sh`) -- criam o admin como `super_admin` e tentam criar tabela `tenants`
2. **init.sql** -- mantem `super_admin` no enum `app_role` e funcao `is_super_admin`
3. **Codigo frontend** (`AuthContext.tsx`) -- mapeia `super_admin` para `admin` (funcional mas desnecessario)

O `types.ts` NAO sera editado pois e gerado automaticamente pelo banco.

## Mudancas Detalhadas

### 1. `deploy/scripts/install-unified.sh`

**Funcao `create_admin_and_tenant()` (linhas 929-1067)**

Problemas atuais:
- Promove admin para `super_admin` em vez de `admin`
- Tenta criar tabela `tenants` (que nao existe mais)
- Tenta criar `tenant_subscriptions` e `subscription_plans`
- Tenta atualizar `profiles.tenant_id`

Correcoes:
- Renomear funcao para `create_admin()`
- Promover admin para `admin` (em vez de `super_admin`)
- Remover TODA a logica de tenant (linhas 1005-1066)
- Manter apenas: criar usuario + promover para admin + configurar baileys_api_key

**Verificacao de tabelas (linha 781)**

Problema: Verifica se `public.tenants` existe para confirmar que init.sql rodou
Correcao: Verificar `public.profiles` em vez de `public.tenants`

### 2. `deploy/scripts/repair-auth.sh`

**Promocao do admin (linhas 258-264)**

Problema: Promove para `super_admin`
Correcao: Promover para `admin`

### 3. `deploy/supabase/init.sql`

**Enum app_role (linha 23)**

Problema: Inclui `super_admin` no enum
Correcao: Manter `super_admin` no enum pois ALTER TYPE DROP VALUE nao e suportado no PostgreSQL, mas a funcao `is_super_admin` pode ser mantida para compatibilidade retroativa (bancos que ja tem usuarios com esse role). O `is_admin_or_manager` ja inclui `super_admin` na checagem, entao tudo funciona.

> NOTA: Nao e possivel remover um valor de um ENUM existente no PostgreSQL sem recriar o tipo inteiro e todas as colunas que o usam. Manter `super_admin` no enum nao causa nenhum problema -- o codigo trata `super_admin` e `admin` como equivalentes.

### 4. `src/contexts/AuthContext.tsx`

Nenhuma mudanca necessaria. A linha `if (dbRole === 'super_admin' || dbRole === 'admin')` ja trata ambos corretamente. Isso garante compatibilidade com bancos VPS que ja tem usuarios `super_admin`.

## Arquivos que serao modificados

| Arquivo | O que muda |
|---------|-----------|
| `deploy/scripts/install-unified.sh` | Remover logica de tenant, promover admin como `admin`, verificar `profiles` em vez de `tenants` |
| `deploy/scripts/repair-auth.sh` | Promover admin como `admin` em vez de `super_admin` |

## O que NAO sera alterado (e por que)

| Arquivo | Motivo |
|---------|--------|
| `deploy/supabase/init.sql` | Ja esta correto -- nao tem tabelas de tenant, RLS esta limpo, funcoes auxiliares estao ok |
| `src/contexts/AuthContext.tsx` | Ja trata `super_admin` como `admin` (compatibilidade) |
| `src/integrations/supabase/types.ts` | Gerado automaticamente, nao pode ser editado |
| `src/components/layout/AppSidebar.tsx` | Ja NAO tem nenhuma referencia a Super Admin |

## Apos aprovacao

Depois que o codigo for atualizado, voce precisara:

1. **Atualizar o repositorio na VPS**: `cd /opt/sistema && sudo git pull`
2. **Reinstalar**: `cd deploy && sudo bash scripts/install-unified.sh`

O script de instalacao agora vai:
- Criar o admin como `admin` (nao `super_admin`)
- NAO tentar criar tabelas de tenant
- Funcionar perfeitamente na primeira execucao

## Secao Tecnica

### Por que manter `super_admin` no enum?

PostgreSQL nao suporta `ALTER TYPE ... DROP VALUE`. Para remover um valor de enum, seria necessario:
1. Criar novo tipo
2. Alterar todas as colunas que usam o tipo
3. Remover tipo antigo
4. Renomear novo tipo

Isso e arriscado em producao e desnecessario pois o codigo ja trata `super_admin === admin`.

### Fluxo da instalacao corrigida

```text
install-unified.sh
  |
  +-- create_admin()          (antes: create_admin_and_tenant)
  |     |
  |     +-- Criar usuario via GoTrue API
  |     +-- Promover para 'admin'     (antes: 'super_admin')
  |     +-- Configurar baileys_api_key
  |     +-- (SEM tenant, SEM subscription)
  |
  +-- verify_installation()
  +-- show_summary()
```

