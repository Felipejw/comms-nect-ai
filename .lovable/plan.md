
# Correção do Connection Failure no Baileys

## Problemas identificados

### 1. Variavel SUPABASE_ANON_KEY nao chega ao container
O arquivo `deploy/baileys/docker-compose.yml` lista apenas 4 variaveis de ambiente (`API_KEY`, `WEBHOOK_URL`, `NODE_ENV`, `LOG_LEVEL`). A `SUPABASE_ANON_KEY` adicionada ao `.env` nunca e repassada ao container Docker.

**Correção:** Adicionar `SUPABASE_ANON_KEY` na seção `environment` do `docker-compose.yml`.

### 2. Falha de conexao no noise handler (problema critico)
Os logs mostram um ciclo repetitivo:
```text
"connected to WA"
"not logged in, attempting registration..."
"Error: Connection Failure" (noise-handler.js:140)
"Connection closed" (shouldReconnect: true)
```

O QR Code nunca e gerado porque o handshake de criptografia falha antes. A versao `@whiskeysockets/baileys@^6.7.16` pode estar desatualizada em relacao ao protocolo atual do WhatsApp.

**Correção:** Atualizar para a versao mais recente do Baileys e melhorar a logica de reconexao com backoff exponencial para evitar rate-limiting.

### 3. Reconexao sem backoff causa rate-limiting
Atualmente o codigo reconecta apos um `setTimeout` fixo de 3 segundos. Em loop rapido, isso pode causar bloqueio temporario pelo WhatsApp.

**Correção:** Implementar backoff exponencial no retry.

---

## Alterações no codigo

### Arquivo 1: `deploy/baileys/docker-compose.yml`
Adicionar a variavel `SUPABASE_ANON_KEY` na seção environment:

```yaml
environment:
  - API_KEY=${API_KEY}
  - WEBHOOK_URL=${WEBHOOK_URL}
  - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
  - NODE_ENV=production
  - LOG_LEVEL=${LOG_LEVEL:-info}
```

### Arquivo 2: `deploy/baileys/package.json`
Atualizar a versao do Baileys para a mais recente disponivel:

```json
"@whiskeysockets/baileys": "^6.7.17"
```

(Sera verificada a versao mais recente no npm antes da implementação)

### Arquivo 3: `deploy/baileys/src/baileys.ts`
- Remover a opcao `printQRInTerminal` (depreciada, gera warnings)
- Implementar backoff exponencial na reconexao (3s, 6s, 12s, ate 60s max)
- Adicionar log mais detalhado do erro de conexao para diagnostico

---

## Apos o deploy das alteracoes

O usuario precisara atualizar na VPS com os seguintes passos:

1. Copiar os arquivos atualizados para `/opt/baileys/`
2. Limpar as sessoes antigas (que estao em loop de erro)
3. Rebuild com `--no-cache` para forçar nova instalação do npm (pegar versao atualizada do Baileys)
4. Verificar nos logs se o QR Code e gerado com sucesso

## Detalhes tecnicos

### Causa raiz do Connection Failure
O erro ocorre em `noise-handler.js:140` durante o `decodeFrame`. O protocolo Noise usado pelo WhatsApp (Noise_XX_25519_AESGCM_SHA256) exige que o cliente esteja atualizado com as chaves e formato de handshake mais recentes. Versoes antigas do Baileys podem ter um formato de handshake incompativel, causando rejeicao imediata.

### Backoff exponencial
O retry atual com intervalo fixo de 3s pode agravar o problema se o WhatsApp estiver bloqueando temporariamente a conexao. Com backoff: 3s -> 6s -> 12s -> 24s -> 48s -> 60s (maximo).
