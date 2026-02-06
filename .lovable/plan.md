

# Fix: Mensagens recebidas no WhatsApp nao aparecem no sistema

## Problema Diagnosticado

O servidor Baileys no VPS esta recebendo as mensagens do WhatsApp corretamente, porem **nao esta enviando os webhooks** para o sistema. A Edge Function `baileys-webhook` nao tem nenhum log, confirmando que nunca foi chamada.

Existem **dois problemas** a corrigir:

1. **VPS: Variaveis de ambiente provavelmente vazias** -- O `.env` do Docker no VPS precisa ter `WEBHOOK_URL` e `SUPABASE_ANON_KEY` preenchidos corretamente para que o webhook funcione.

2. **Codigo: `restoreSessions()` nao e chamado ao iniciar** -- O `index.ts` do Baileys nao chama `restoreSessions()` no startup, entao apos rebuild/restart do Docker, as sessoes anteriores sao perdidas e novas sessoes criadas pelo edge function podem nao ter o webhook configurado corretamente.

## Plano de Correcao

### Etapa 1: Atualizar o `index.ts` do repositorio

Adicionar a chamada de `restoreSessions()` ao iniciar o servidor, para que sessoes existentes sejam restauradas automaticamente com a URL de webhook correta.

**Arquivo:** `deploy/baileys/src/index.ts`

Alterar o final do arquivo para:
```text
import { ..., restoreSessions } from './baileys.js';

app.listen(PORT, async () => {
  logger.info({ port: PORT }, 'Baileys server started');
  console.log(`Baileys server running on port ${PORT}`);
  
  // Restaurar sessoes existentes
  try {
    await restoreSessions();
    logger.info('Sessions restored successfully');
  } catch (err) {
    logger.error({ err }, 'Error restoring sessions');
  }
});
```

### Etapa 2: Melhorar logs de webhook no `baileys.ts`

Adicionar log mais detalhado na funcao `sendWebhook` para facilitar diagnostico:

**Arquivo:** `deploy/baileys/src/baileys.ts`

Na funcao `sendWebhook`, adicionar log do URL e status de resposta para facilitar debug no VPS.

### Etapa 3: Orientar usuario a configurar `.env` no VPS

O usuario precisara executar no VPS:

```text
# Verificar .env atual
cat /opt/baileys/.env

# Preencher as variaveis obrigatorias
sudo tee -a /opt/baileys/.env << 'EOF'
WEBHOOK_URL=https://qducanwbpleoceynmend.supabase.co/functions/v1/baileys-webhook
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdWNhbndicGxlb2NleW5tZW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNTUxODIsImV4cCI6MjA4MjYzMTE4Mn0.1EQ_XXifnOx3REsjE9ZCbd7dYC7IvXxEjZFIP25vmOA
EOF
```

Depois, rebuild:
```text
sudo docker compose down
sudo docker compose up -d
sudo docker compose logs -f baileys
```

### Etapa 4: Melhorar a Edge Function `baileys-webhook`

Adicionar log mais informativo na entrada da funcao para confirmar que esta sendo chamada e com que dados, facilitando debug futuro.

## Resumo Tecnico

```text
Fluxo atual (quebrado):
  WhatsApp -> Baileys Server -> [webhook nao enviado] -> baileys-webhook -> DB

Fluxo corrigido:
  WhatsApp -> Baileys Server -> POST /functions/v1/baileys-webhook -> DB -> Realtime -> UI
```

**Arquivos a modificar:**
- `deploy/baileys/src/index.ts` -- adicionar `restoreSessions()` no startup
- `deploy/baileys/src/baileys.ts` -- melhorar logs do webhook
- `supabase/functions/baileys-webhook/index.ts` -- melhorar logs de entrada

**Apos implementar:** O usuario precisara atualizar os arquivos no VPS e reconstruir o container Docker.

