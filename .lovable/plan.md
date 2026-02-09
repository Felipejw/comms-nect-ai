
# Corrigir chave inconsistente nas Edge Functions

## Problema

Tres edge functions estao lendo a configuracao do Baileys com a chave **errada** (`baileys_api_url`) ao inves da chave correta (`baileys_server_url`). Como `baileys_api_url` nao existe no banco, elas caem no fallback `http://baileys:3001`, que so funciona dentro da rede Docker do VPS e nao resolve no Cloud.

Funcoes afetadas:
- `supabase/functions/check-connections/index.ts` (linha 54)
- `supabase/functions/sync-contacts/index.ts` (linha 52)
- `supabase/functions/fetch-whatsapp-profile/index.ts` (linha 97)

Funcoes que ja usam a chave correta (nao precisam de alteracao):
- `baileys-instance`, `send-whatsapp`, `execute-flow`, `download-whatsapp-media`, `baileys-webhook`

## Alteracoes

### 1. `supabase/functions/check-connections/index.ts`

Trocar a query de `baileys_api_url` para `baileys_server_url` na linha 54.

Tambem adicionar a leitura da `baileys_api_key` e incluir o header `X-API-Key` nas chamadas fetch, pois atualmente essa funcao nao envia autenticacao.

### 2. `supabase/functions/sync-contacts/index.ts`

Trocar a query de `baileys_api_url` para `baileys_server_url` na linha 52.

Tambem adicionar leitura da `baileys_api_key` e header de autenticacao.

### 3. `supabase/functions/fetch-whatsapp-profile/index.ts`

Trocar a query de `baileys_api_url` para `baileys_server_url` na linha 97.

Tambem adicionar leitura da `baileys_api_key` e header de autenticacao.

## Resultado esperado

Apos a correcao, todas as edge functions lerao a URL do `system_settings` com a chave `baileys_server_url` (que contem `https://chatbotvital.store/baileys`), garantindo que funcionem tanto no Cloud quanto na VPS.
