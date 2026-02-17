
# Correcao: Media no VPS + Mensagens em Tempo Real

## Problema 1: Media nao carrega no VPS

**Causa raiz**: O webhook do Baileys salva a mensagem com `media_url: null` quando o campo `base64` nao vem no payload. O `MediaAutoDownloader` tenta baixar via endpoint `/sessions/{session}/messages/{messageId}/media` do servidor Baileys, mas esse endpoint nao existe ou o messageId nao corresponde ao formato esperado pelo Baileys.

**Solucao**: O webhook do Baileys precisa ser mais agressivo em tentar baixar a midia no momento do recebimento. Quando `hasMedia` ou `mediaType` indica midia mas nao tem `base64`, o webhook deve tentar chamar o download-whatsapp-media internamente. Alem disso, o `MediaAutoDownloader` precisa de um fallback melhor - quando a edge function falha, deve mostrar o conteudo da mensagem (texto como "[Imagem]") sem ficar em loop infinito.

## Problema 2: Mensagens nao atualizam em tempo real

**Causa raiz**: O webhook do Baileys insere a mensagem no banco mas **NAO** atualiza a conversation (`last_message_at`, `unread_count`, `subject`). Sem essa atualizacao:
- A subscription realtime na tabela `conversations` nao dispara
- A lista de conversas nao re-ordena
- O badge de nao-lidas nao aparece

O `useMessages` tem polling de 10 segundos, mas ele so funciona para a conversa **selecionada** - se o usuario nao estiver olhando aquela conversa, nao ve nada.

## Alteracoes Planejadas

### 1. Webhook Baileys - Atualizar conversa ao receber mensagem

**Arquivo**: `supabase/functions/baileys-webhook/index.ts`

Apos inserir a mensagem (linha ~591), adicionar logica para atualizar a conversa:

- Incrementar `unread_count` (apenas para mensagens de contato, nao `fromMe`)
- Atualizar `last_message_at` com timestamp atual
- Atualizar `subject` com preview da mensagem (emojis para midia)

Isso fara o realtime na tabela `conversations` disparar, que por sua vez invalida as queries de mensagens no frontend.

### 2. Webhook Baileys - Tentar download de midia inline

**Arquivo**: `supabase/functions/baileys-webhook/index.ts`

Quando detecta midia mas nao tem `base64`, tentar buscar do Baileys server imediatamente dentro do webhook (usando a mesma logica de `download-whatsapp-media`), em vez de deixar para o frontend.

### 3. MediaAutoDownloader - Melhorar tratamento de erro

**Arquivo**: `src/components/atendimento/MediaAutoDownloader.tsx`

- Quando todas as tentativas falham, mostrar o conteudo da mensagem (ex: "[Imagem]", "[Audio]") em vez de ficar indefinidamente no estado de erro
- Reduzir o numero maximo de tentativas automaticas quando no VPS (detectar via URL do Supabase)

### 4. useMessages - Garantir polling robusto

**Arquivo**: `src/hooks/useConversations.ts`

O polling de 10 segundos ja existe (linha 310). Vamos verificar se esta funcionando corretamente e adicionar um refetch mais frequente (5 segundos) para a conversa ativa.

---

## Detalhes Tecnicos

### Atualizacao do webhook (passo 1 - mais critico)

Apos a linha 591 do webhook, inserir:

```typescript
// Update conversation with latest message info
const subjectPreview = msgType === 'audio' ? '🎵 Audio' 
  : msgType === 'image' ? '📷 Imagem'
  : msgType === 'video' ? '🎬 Video' 
  : msgType === 'document' ? '📎 Documento'
  : messageContent.substring(0, 100);

const convUpdates = {
  last_message_at: new Date().toISOString(),
  subject: subjectPreview,
};

if (!isFromMe) {
  // Increment unread count using RPC or raw update
  await supabaseClient.rpc('increment_unread', { conv_id: conversation.id });
  // OR fallback: update with current + 1
}

await supabaseClient
  .from('conversations')
  .update(convUpdates)
  .eq('id', conversation.id);
```

Como nao temos uma funcao RPC, faremos o incremento manualmente buscando o valor atual e somando 1.

### Download de midia inline no webhook (passo 2)

Quando `hasMedia` e true mas `base64Data` e vazio, e `baileysUrl` esta configurado, tentar baixar a midia no proprio webhook antes de salvar a mensagem com `media_url: null`.

### Arquivos modificados

| Arquivo | Acao |
|---------|------|
| `supabase/functions/baileys-webhook/index.ts` | Editar - atualizar conversa + download inline |
| `src/components/atendimento/MediaAutoDownloader.tsx` | Editar - melhorar fallback |
| `src/hooks/useConversations.ts` | Editar - polling mais frequente |
