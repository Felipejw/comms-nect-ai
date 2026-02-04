
# Plano: Corrigir Status Persistente do Servidor e Carregamento do QR Code

## Problemas Identificados

### Problema 1: Status do servidor Baileys volta para "Não verificado"
O componente `BaileysConfigSection` usa estado local (`connectionStatus`) que inicia como `"unknown"`. O status só muda quando o usuário clica manualmente em "Testar Conexão", não sendo persistido nem verificado automaticamente.

### Problema 2: QR Code fica em loading infinito  
A sessão existe no servidor Baileys, mas o QR Code não está sendo salvo no banco de dados. O polling atual só chama `checkStatus` (que verifica status) mas não chama `getQrCode`. O fluxo esperado é:
1. Servidor Baileys gera QR e envia via webhook para `baileys-webhook`
2. O webhook atualiza o `qr_code` no banco
3. O frontend exibe o QR

Verificando os dados: a conexão "Teste" está com `status: connecting`, `qr_code: null`, indicando que o webhook não está recebendo/processando o QR.

## Solução

### 1. BaileysConfigSection - Auto-verificar status ao carregar

**Arquivo:** `src/components/configuracoes/BaileysConfigSection.tsx`

Adicionar verificação automática do status quando a URL e API Key estiverem configuradas:

```typescript
// Após carregar as configurações, verificar status automaticamente
useEffect(() => {
  if (initialLoadDone && serverUrl && apiKey) {
    handleTestConnection();
  }
}, [initialLoadDone]);
```

Isso garantirá que ao entrar na página de configurações, o status do servidor será verificado automaticamente.

### 2. Polling do QR Code - Buscar QR durante polling

**Arquivo:** `src/pages/Conexoes.tsx`

Modificar o polling para também buscar o QR Code quando a conexão está em "connecting" mas sem QR:

```typescript
// Dentro do useEffect de polling
if (connection.status === "connecting" && !connection.qr_code) {
  // Tentar buscar QR Code
  await getQrCode.mutateAsync(pollingConnection).catch(() => {});
  // ...resto do código
}
```

### 3. Verificar Edge Function baileys-webhook

**Arquivo:** `supabase/functions/baileys-webhook/index.ts`

Verificar se a edge function está processando corretamente o evento `qr.update` e salvando no banco.

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/configuracoes/BaileysConfigSection.tsx` | Adicionar auto-verificação de status ao carregar |
| `src/pages/Conexoes.tsx` | Adicionar chamada `getQrCode` no polling quando status é "connecting" |
| `supabase/functions/baileys-webhook/index.ts` | Verificar/corrigir processamento do evento `qr.update` |

## Detalhes Técnicos

### Fluxo do QR Code atual:
```text
1. Frontend chama createConnection ou recreateConnection
2. Edge function cria sessão no Baileys Server
3. Baileys Server gera QR e envia webhook para baileys-webhook
4. baileys-webhook DEVERIA atualizar qr_code no banco
5. Frontend faz polling e exibe o QR
```

### Problema no fluxo:
O passo 4 não está funcionando - o webhook não está recebendo ou processando o evento corretamente, resultando em `qr_code: null` no banco.

### Solução alternativa:
Se o webhook não funcionar, o frontend pode buscar ativamente o QR Code chamando a action `getQrCode` durante o polling.

## Próximos Passos

1. Aprovar este plano
2. Implementar as correções
3. Testar criando uma nova conexão ou clicando em "Reconectar"
4. Verificar se o QR Code aparece na modal
