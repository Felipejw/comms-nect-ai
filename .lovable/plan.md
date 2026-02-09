
# Corrigir Salvamento de Configuracoes - Solucao Definitiva

## Diagnostico Preciso

O erro **"new row violates row-level security policy for table system_settings"** acontece porque:

1. O codigo atual (`safeSettingUpsert.ts`) tenta salvar diretamente no banco usando o **cliente do navegador** (anon key)
2. A politica RLS da tabela `system_settings` exige que o usuario tenha role 'admin' ou 'manager' verificado pela funcao `is_admin_or_manager()`
3. No VPS self-hosted, essa verificacao falha -- provavelmente porque a funcao `is_admin_or_manager` ou a tabela `user_roles` nao estao sincronizadas corretamente

Isso afeta **apenas o VPS**. No Lovable Cloud funciona porque o banco esta configurado corretamente.

## Solucao: Backend Function para Salvar Configuracoes

Em vez de tentar corrigir permissoes do PostgreSQL no VPS (que quebra a cada atualizacao), a solucao e **mover a logica de salvamento para uma funcao backend** que roda na nuvem com permissoes privilegiadas.

### Como funciona

```text
Antes (quebra no VPS):
  Navegador --> Client Supabase (anon key) --> RLS Policy --> BLOQUEADO

Depois (funciona sempre):
  Navegador --> Edge Function --> Service Role Key --> Salva direto (sem RLS)
```

### Mudancas necessarias

**1. Criar nova funcao backend: `supabase/functions/save-system-setting/index.ts`**

- Recebe: `key`, `value`, `description`, `category`
- Valida que o usuario esta autenticado (via Authorization header)
- Verifica se o usuario tem role admin/manager (consultando `user_roles` com service role)
- Salva a configuracao usando service role key (que ignora RLS)
- Lida com duplicatas e upsert de forma segura

**2. Atualizar `src/lib/safeSettingUpsert.ts`**

- Em vez de fazer operacoes diretas no banco, chamar a nova funcao backend via `supabase.functions.invoke("save-system-setting", ...)`
- Manter a mesma interface para que `useSystemSettings.ts` e `BaileysConfigSection.tsx` continuem funcionando sem alteracao

**3. Registrar a funcao no `supabase/config.toml`**

- Adicionar `[functions.save-system-setting]` com `verify_jwt = false` (a validacao e feita no codigo)

### Por que essa solucao e definitiva

- A funcao backend roda na **nuvem**, nao depende do VPS
- Usa **service role key** que ignora todas as politicas RLS
- A seguranca e mantida pela **validacao de role no codigo** da funcao
- Nenhuma mudanca necessaria no VPS -- funciona imediatamente apos deploy
- Os componentes existentes (`BaileysConfigSection`, `OptionsTab`, `CustomizeTab`) continuam funcionando sem alteracao

### Arquivos afetados

1. `supabase/functions/save-system-setting/index.ts` -- Nova funcao backend
2. `src/lib/safeSettingUpsert.ts` -- Atualizar para chamar a funcao backend
3. `supabase/config.toml` -- Registrar nova funcao
