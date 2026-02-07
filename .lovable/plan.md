

# Correção: Incluir tenant_id em todas as operações de criação

## O que está acontecendo (explicação simples)

O sistema é multi-empresa (multi-tenant). Cada dado no banco pertence a uma empresa identificada por um `tenant_id`. Quando o código cria um contato, ele não informa a qual empresa o contato pertence, e o banco rejeita a operação por segurança.

O mesmo problema pode afetar outras operações de criação (tags, agendamentos, campanhas, etc).

## O que será feito

### 1. Corrigir criação de contatos (useContacts.ts)

Adicionar `tenant_id` do usuário logado ao criar um contato:

```typescript
// ANTES (sem tenant_id):
const { data, error } = await supabase
  .from('contacts')
  .insert(input)

// DEPOIS (com tenant_id):
const { data: { user } } = await supabase.auth.getUser();
const { data: profile } = await supabase
  .from('profiles')
  .select('tenant_id')
  .eq('user_id', user.id)
  .single();

const { data, error } = await supabase
  .from('contacts')
  .insert({ ...input, tenant_id: profile.tenant_id })
```

### 2. Corrigir importação de contatos (Contatos.tsx)

A importação de CSV também não inclui `tenant_id`. Será corrigido da mesma forma.

### 3. Corrigir todas as outras tabelas que precisam de tenant_id

Verificar e corrigir os hooks de criação para todas as tabelas que exigem `tenant_id`:

| Hook/Arquivo | Tabela | Problema |
|---|---|---|
| useContacts.ts (useCreateContact) | contacts | Falta tenant_id no INSERT |
| Contatos.tsx (importação CSV) | contacts | Falta tenant_id no INSERT direto |
| useTags.ts | tags | Verificar se inclui tenant_id |
| useCampaigns.ts | campaigns | Verificar se inclui tenant_id |
| useSchedules.ts | schedules | Verificar se inclui tenant_id |
| useQuickReplies.ts | quick_replies | Verificar se inclui tenant_id |

### 4. Criar helper reutilizável para pegar o tenant_id

Para não repetir código, criar uma função utilitária:

```typescript
// Em um novo hook ou utilitário
async function getUserTenantId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
    
  return profile?.tenant_id || null;
}
```

### 5. Atualizar init.sql para VPS

Adicionar as UNIQUE constraints que podem estar faltando em instalações anteriores. Usar blocos DO/EXCEPTION para não falhar se já existirem:

```sql
-- No final do init.sql, adicionar migração para instalações existentes:
DO $$ BEGIN
  ALTER TABLE public.system_settings 
    ADD CONSTRAINT system_settings_key_unique UNIQUE (key);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.tenant_settings 
    ADD CONSTRAINT tenant_settings_tenant_id_key_unique UNIQUE (tenant_id, key);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
```

## Comando SQL para rodar na VPS agora

Se ainda não rodou, execute este comando para corrigir o banco existente:

```bash
sudo docker exec supabase-db psql -U postgres -c "
  -- Remover duplicatas de system_settings
  DELETE FROM public.system_settings a
  USING public.system_settings b
  WHERE a.id < b.id AND a.key = b.key;

  -- Adicionar UNIQUE se não existe
  DO \$\$ BEGIN
    ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_key_unique UNIQUE (key);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END \$\$;

  -- Remover duplicatas de tenant_settings
  DELETE FROM public.tenant_settings a
  USING public.tenant_settings b
  WHERE a.id < b.id AND a.tenant_id = b.tenant_id AND a.key = b.key;

  DO \$\$ BEGIN
    ALTER TABLE public.tenant_settings ADD CONSTRAINT tenant_settings_tenant_id_key_unique UNIQUE (tenant_id, key);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END \$\$;
"
```

## Arquivos a serem modificados

| Arquivo | O que muda |
|---|---|
| src/hooks/useContacts.ts | Incluir tenant_id no insert de useCreateContact |
| src/pages/Contatos.tsx | Incluir tenant_id na importação CSV |
| src/hooks/useTags.ts | Verificar e incluir tenant_id |
| src/hooks/useCampaigns.ts | Verificar e incluir tenant_id |
| src/hooks/useSchedules.ts | Verificar e incluir tenant_id |
| src/hooks/useQuickReplies.ts | Verificar e incluir tenant_id |
| deploy/supabase/init.sql | Adicionar migrações de UNIQUE constraints |

## Resultado

Depois destas correções:
- Criar contatos vai funcionar sem erro de segurança
- Importar contatos via CSV vai funcionar
- Salvar configurações do Baileys vai funcionar (após rodar o SQL acima)
- Todas as operações de criação terão o tenant_id correto
- VPS novas já terão as constraints corretas desde o início

