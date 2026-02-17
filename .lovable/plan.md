
# Correcao: QR Code nao aparece apos instalacao limpa

## Causa Raiz

O install-unified.sh tenta configurar as credenciais do Baileys no banco usando `UPDATE`, mas as linhas nao existem ainda na tabela `system_settings` (instalacao do zero). O resultado e `UPDATE 0` -- zero linhas afetadas. Sem essas configuracoes, a edge function `baileys-instance` nao sabe a URL nem a API Key do servidor Baileys, e falha ao tentar gerar o QR Code.

Alem disso, o script so configura `baileys_api_key` mas **nunca configura `baileys_server_url`**, que tambem e necessario.

## Correcoes

### 1. Corrigir `deploy/scripts/install-unified.sh` (linhas 1059-1066)

Trocar o `UPDATE` por `INSERT ... ON CONFLICT DO UPDATE` e incluir ambas as chaves (`baileys_server_url` e `baileys_api_key`):

```sql
INSERT INTO public.system_settings (key, value)
VALUES
  ('baileys_server_url', 'http://baileys:3000'),
  ('baileys_api_key', '<BAILEYS_API_KEY>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

A URL usa `http://baileys:3000` (rede Docker interna) porque a edge function roda dentro do container `supabase-functions` na mesma rede Docker.

### 2. Adicionar fallback por variavel de ambiente na edge function `baileys-instance`

Modificar `supabase/functions/baileys-instance/index.ts` para que, se `system_settings` nao tiver a URL/Key, use as variaveis de ambiente `BAILEYS_API_URL` e `BAILEYS_API_KEY` (que ja estao configuradas no docker-compose.yml):

```typescript
const baileysUrl = settings?.value || Deno.env.get("BAILEYS_API_URL");
const baileysApiKey = apiKeySettings?.value || Deno.env.get("BAILEYS_API_KEY");
```

Isso garante que funcione mesmo se o banco nao tiver as settings (failsafe).

### 3. Corrigir `deploy/scripts/update.sh`

Adicionar a mesma logica de UPSERT no script de update, para que atualizacoes futuras tambem sincronizem as credenciais.

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `deploy/scripts/install-unified.sh` | Trocar UPDATE por INSERT ON CONFLICT para baileys_server_url e baileys_api_key |
| `supabase/functions/baileys-instance/index.ts` | Adicionar fallback para env vars BAILEYS_API_URL e BAILEYS_API_KEY |
| `deploy/scripts/update.sh` | Adicionar UPSERT das credenciais Baileys no banco apos restart |

## Correcao Imediata (VPS)

Enquanto o codigo e atualizado, rode isso na VPS para corrigir agora:

```bash
source /opt/sistema/deploy/.env
docker exec supabase-db psql -U postgres -c "
  INSERT INTO public.system_settings (key, value)
  VALUES
    ('baileys_server_url', 'http://baileys:3000'),
    ('baileys_api_key', '$BAILEYS_API_KEY')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
"
```
