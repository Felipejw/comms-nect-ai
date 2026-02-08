

# Corrigir Salvamento Intermitente de Configuracoes

## Causa Raiz

O problema esta no arquivo `src/lib/safeSettingUpsert.ts`. A funcao usa `.maybeSingle()` sem `.limit(1)`:

```typescript
const { data: existing } = await supabase
  .from("system_settings")
  .select("id")
  .eq("key", key)
  .maybeSingle();  // FALHA se houver 2+ linhas com a mesma key
```

Quando o salvamento funcionou pela primeira vez, ele fez INSERT. Se por qualquer motivo (race condition entre os dois saves sequenciais, ou tentativas anteriores) existirem linhas duplicadas com a mesma `key`, o `.maybeSingle()` retorna erro em vez de dados -- e o salvamento falha toda vez a partir dai.

## Solucao

### 1. Tornar `safeSettingUpsert` mais robusto

Reescrever a funcao para:
- Usar `.limit(1)` antes de `.maybeSingle()` para nunca falhar em duplicatas
- Limpar duplicatas automaticamente quando encontradas
- Adicionar logs detalhados para diagnostico
- Ter fallback: se UPDATE falha, tenta DELETE + INSERT

### 2. Adicionar limpeza automatica de duplicatas

Na funcao, antes do SELECT principal, adicionar logica que detecta e remove linhas duplicadas com a mesma `key`, mantendo apenas a mais recente.

### 3. Melhorar tratamento de erros no `BaileysConfigSection`

Adicionar logs mais detalhados no catch do `handleSave` para facilitar diagnostico futuro.

## Arquivos a modificar

1. **`src/lib/safeSettingUpsert.ts`** -- Reescrever com logica resiliente:
   - Adicionar `.limit(1)` no SELECT
   - Adicionar limpeza de duplicatas
   - Adicionar fallback DELETE + INSERT
   - Adicionar logs de diagnostico

2. **`src/components/configuracoes/BaileysConfigSection.tsx`** -- Melhorar diagnostico de erros no `handleSave`

## Detalhes Tecnicos

### Nova logica do `safeSettingUpsert`:

```text
1. SELECT count(*) WHERE key = X
2. Se count > 1: DELETE extras, manter apenas o mais recente
3. SELECT id WHERE key = X LIMIT 1
4. Se existe: UPDATE WHERE id = (id encontrado)
5. Se nao existe: INSERT
6. Se INSERT falha (possivel duplicata): tenta UPDATE WHERE key = X
```

### Mudancas no `BaileysConfigSection`:

- Adicionar `console.error` mais detalhado com status code HTTP
- Mostrar mensagem de erro mais especifica no toast

## Comando de diagnostico para o VPS (rodar agora)

Para verificar se ja existem duplicatas no banco:

```bash
sudo docker exec supabase-db psql -U postgres -c "
  SELECT key, count(*) as qtd 
  FROM public.system_settings 
  GROUP BY key 
  HAVING count(*) > 1;
"
```

Se retornar linhas, confirma que o problema sao duplicatas. De qualquer forma, a correcao no codigo vai resolver independentemente.

