
# Correção: Erro ao Salvar Configurações no VPS

## Problema Raiz

O banco de dados no VPS foi criado antes do init.sql incluir constraints UNIQUE. Como o init.sql usa `CREATE TABLE IF NOT EXISTS`, as constraints novas nunca foram aplicadas em tabelas ja existentes.

O codigo usa `upsert({ onConflict: "key" })` que **exige** uma constraint UNIQUE na coluna especificada. Sem ela, o PostgreSQL rejeita a operacao com erro.

Isso afeta:
- **CustomizeTab.tsx** -- usa `.upsert(update, { onConflict: "key" })` na tabela `system_settings`
- **useTenant.ts** -- usa `.upsert(..., { onConflict: "tenant_id,key" })` na tabela `tenant_settings`
- **BaileysConfigSection.tsx** -- usa `createOrUpdateSetting` que faz SELECT+INSERT/UPDATE (menos afetado, mas pode gerar duplicatas)

## Correcao no VPS (comando SQL)

O usuario precisa rodar no servidor:

```bash
sudo docker exec supabase-db psql -U postgres -c "
  -- Remover duplicatas de system_settings (manter a mais recente)
  DELETE FROM public.system_settings a
  USING public.system_settings b
  WHERE a.id < b.id AND a.key = b.key;

  -- Adicionar UNIQUE constraint se nao existe
  ALTER TABLE public.system_settings
    ADD CONSTRAINT system_settings_key_unique UNIQUE (key);

  -- Remover duplicatas de tenant_settings
  DELETE FROM public.tenant_settings a
  USING public.tenant_settings b
  WHERE a.id < b.id AND a.tenant_id = b.tenant_id AND a.key = b.key;

  -- Adicionar UNIQUE constraint se nao existe
  ALTER TABLE public.tenant_settings
    ADD CONSTRAINT tenant_settings_tenant_id_key_unique UNIQUE (tenant_id, key);
"
```

## Correcoes no Codigo (resiliencia)

### 1. Melhorar mensagens de erro no useSystemSettings.ts

Adicionar detalhes completos do erro PostgREST (code, message, details, hint) em todas as mutations para facilitar diagnostico:

```typescript
onError: (error: any) => {
  const msg = error?.message || 'desconhecido';
  const code = error?.code || '';
  const details = error?.details || '';
  console.error('System settings error:', { code, msg, details });
  toast.error(`Erro ao salvar: ${msg}`);
},
```

### 2. Tornar createOrUpdateSetting robusto (useSystemSettings.ts)

Substituir o padrao SELECT+INSERT/UPDATE por `upsert` nativo do Supabase que eh atomico e nao sofre com race conditions:

```typescript
const { error } = await supabase
  .from("system_settings")
  .upsert(
    { key, value, description, category },
    { onConflict: "key" }
  );
if (error) throw error;
```

### 3. Melhorar mensagens de erro no BaileysConfigSection.tsx

Logar o erro completo no console para facilitar diagnostico remoto:

```typescript
} catch (error: any) {
  console.error("Baileys save error:", JSON.stringify(error, null, 2));
  const errorMsg = error?.message || error?.toString() || 'Erro desconhecido';
  toast.error(`Erro ao salvar configurações: ${errorMsg}`);
}
```

### 4. Melhorar mensagens de erro no CustomizeTab.tsx

Incluir detalhes do erro no toast:

```typescript
} catch (error: any) {
  console.error("Branding save error:", JSON.stringify(error, null, 2));
  const errorMsg = error?.message || error?.toString() || 'Erro desconhecido';
  toast.error(`Erro ao salvar configurações: ${errorMsg}`);
}
```

### 5. Melhorar mensagem de erro no useTenant.ts

```typescript
onError: (error: any) => {
  console.error("Tenant setting upsert error:", error);
  toast.error("Erro ao salvar configuração: " + (error?.message || 'desconhecido'));
},
```

## Arquivos a serem modificados

| Arquivo | Alteracao |
|---------|-----------|
| src/hooks/useSystemSettings.ts | Usar upsert atomico + melhorar logs de erro |
| src/components/configuracoes/BaileysConfigSection.tsx | Melhorar log de erro no catch |
| src/components/configuracoes/CustomizeTab.tsx | Incluir detalhes do erro no toast |
| src/hooks/useTenant.ts | Melhorar log de erro |

## Resultado Esperado

Apos rodar o comando SQL no VPS e atualizar o codigo:
- Salvar configuracoes do Baileys funciona
- Salvar identidade visual funciona  
- Salvar opcoes do sistema funciona
- Em caso de erro, a mensagem tecnica aparece no toast e no console
- Operacoes de upsert sao atomicas e nao criam duplicatas
