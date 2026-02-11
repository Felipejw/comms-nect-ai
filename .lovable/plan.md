

## Corrigir Erros de RLS no Backup/Restore

### Problema

A restauracao do backup usa chamadas diretas ao Supabase (`supabase.from(table).upsert()`), que sao bloqueadas pelas politicas de RLS em tabelas como `connections`, `system_settings`, `integrations`, `ai_settings`, entre outras que exigem role de admin.

### Solucao

Usar o helper `adminWrite()` ja existente no projeto para todas as operacoes de upsert durante a restauracao. Este helper tenta a Edge Function `admin-write` (que usa service_role e ignora RLS) e faz fallback para chamada direta se necessario.

### Alteracoes

**1. Edge Function `supabase/functions/admin-write/index.ts`**

Adicionar as tabelas que faltam na whitelist `ALLOWED_TABLES`:
- `profiles`
- `user_roles`
- `user_permissions`
- `contacts`
- `contact_tags`
- `conversations`
- `conversation_tags`
- `messages`
- `campaigns`
- `campaign_contacts`
- `quick_replies`
- `schedules`
- `activity_logs`

Isso permite que o backup restaure TODAS as 26 tabelas via service role.

**2. Componente `src/components/configuracoes/BackupTab.tsx`**

Substituir a chamada direta `supabase.from(table).upsert(batch, ...)` pelo helper `adminWrite({ table, operation: "upsert", data: batch, onConflict: "id" })` que ja existe em `src/lib/adminWrite.ts`.

### Resultado esperado

- Restauracao sem erros de RLS em nenhuma tabela
- Funciona tanto no ambiente Cloud quanto no VPS self-hosted
- Nenhuma dependencia nova

