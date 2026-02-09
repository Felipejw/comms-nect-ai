
# Correcao Definitiva: Operacoes Admin no VPS

## Diagnostico Completo

Existem **dois problemas distintos**:

### Problema 1: Edge Function "save-system-setting" nao funciona no VPS
O erro "Edge Function returned a non-2xx status code" acontece porque a funcao `save-system-setting` **nao esta registrada no roteador do VPS** (`supabase/functions/main/index.ts`). O VPS usa um roteador central que lista todas as funcoes disponiveis, e a nova funcao nao foi adicionada la.

### Problema 2: RLS bloqueia escrita em tabelas admin no VPS  
O erro "new row violates row-level security policy for table queues" acontece porque as tabelas com restricao admin (`queues`, `tags`, `campaigns`, etc.) usam a funcao `is_admin_or_manager(auth.uid())` nas politicas RLS. No VPS, essa verificacao falha -- provavelmente porque as permissoes do PostgreSQL ou os grants para o role `authenticated` nao estao sincronizados corretamente.

**Tabelas afetadas**: `queues`, `tags`, `campaigns`, `campaign_contacts`, `chatbot_rules`, `kanban_columns`, `connections`, `queue_agents`, `system_settings`

## Solucao: Edge Function Generica para Escrita Admin

Em vez de corrigir permissoes do PostgreSQL no VPS (que quebram a cada atualizacao), a solucao e criar uma **funcao backend generica** que lida com todas as operacoes de escrita em tabelas restritas a admin.

```text
Antes (quebra no VPS):
  Frontend --> Supabase Client (anon key) --> RLS Policy --> BLOQUEADO

Depois (funciona sempre):
  Frontend --> Edge Function (admin-write) --> Service Role Key --> OK
```

## Mudancas Necessarias

### 1. Criar funcao backend generica: `supabase/functions/admin-write/index.ts`

Funcao unica que lida com INSERT, UPDATE e DELETE em qualquer tabela admin-restrita:
- Recebe: `table`, `operation` (insert/update/delete), `data`, `filters`
- Valida autenticacao via Authorization header
- Verifica role admin/manager usando service_role
- Executa a operacao com service_role key (ignora RLS)
- Whitelist de tabelas permitidas (seguranca contra injecao)

### 2. Criar helper frontend: `src/lib/adminWrite.ts`

Funcao utilitaria que:
- Chama a Edge Function `admin-write`
- Se falhar, faz fallback para operacao direta no banco (para ambientes onde RLS funciona normalmente)
- Mantem a mesma interface para os hooks existentes

### 3. Atualizar roteador VPS: `supabase/functions/main/index.ts`

Adicionar `save-system-setting` e `admin-write` na lista de funcoes disponiveis no roteador do VPS.

### 4. Adicionar fallback no `src/lib/safeSettingUpsert.ts`

Tentar Edge Function primeiro, se falhar, tentar operacao direta no banco como fallback.

### 5. Atualizar hooks que escrevem em tabelas admin

- **`src/hooks/useQueues.ts`**: Usar `adminWrite` para create/update/delete de filas e agentes
- **`src/hooks/useTags.ts`**: Usar `adminWrite` para create/update/delete de tags

### 6. Registrar funcao no `supabase/config.toml`

Adicionar `[functions.admin-write]` com `verify_jwt = false`.

## Detalhes Tecnicos

### Whitelist de tabelas permitidas no admin-write

```text
queues, queue_agents, tags, campaigns, campaign_contacts,
chatbot_rules, kanban_columns, connections, integrations,
ai_settings, api_keys, system_settings
```

### Operacoes suportadas

- **insert**: Insere registro e retorna o dado criado
- **update**: Atualiza registros com base nos filtros (obrigatorios)
- **delete**: Remove registros com base nos filtros (obrigatorios)

### Seguranca

- Autenticacao obrigatoria (verifica JWT)
- Verificacao de role admin/manager no codigo
- Whitelist de tabelas (rejeita tabelas nao permitidas)
- Filtros obrigatorios para update/delete (previne alteracoes em massa acidentais)

### Fluxo de fallback no frontend

```text
1. Tentar Edge Function (admin-write ou save-system-setting)
2. Se falhar (VPS desatualizado ou funcao indisponivel):
   2a. Tentar operacao direta via Supabase client
   2b. Se tambem falhar (RLS): mostrar erro ao usuario
```

## Arquivos Afetados

1. `supabase/functions/admin-write/index.ts` -- Nova funcao backend generica
2. `supabase/functions/main/index.ts` -- Adicionar rotas no VPS
3. `src/lib/adminWrite.ts` -- Novo helper frontend
4. `src/lib/safeSettingUpsert.ts` -- Adicionar fallback
5. `src/hooks/useQueues.ts` -- Usar adminWrite para escrita
6. `src/hooks/useTags.ts` -- Usar adminWrite para escrita
7. `supabase/config.toml` -- Registrar nova funcao

## Por que essa solucao e definitiva

- **Uma funcao resolve tudo**: qualquer nova tabela admin-restrita so precisa ser adicionada na whitelist
- **Funciona no VPS e no Cloud**: Edge Function com service_role ignora RLS
- **Fallback inteligente**: se a Edge Function nao estiver disponivel, tenta direto (para Cloud onde RLS funciona)
- **Nenhuma mudanca no banco do VPS**: nao precisa rodar SQL nem reiniciar containers
- **Seguranca mantida**: validacao de role no codigo + whitelist de tabelas
