
# Correcao: Mensagens nao aparecem em tempo real

## Problema Identificado

O hook `useMessages` depende exclusivamente de uma assinatura Realtime com `setQueryData` para adicionar novas mensagens. Se a assinatura perde um evento (instabilidade de rede, reconexao do WebSocket), a mensagem fica "invisivel" ate o usuario sair e voltar (o que causa um refetch completo).

Alem disso, quando uma nova mensagem chega e atualiza a tabela `conversations` (campo `last_message_at`), o canal de conversas invalida apenas `['conversations']` mas **nao** invalida `['messages', conversationId]`, perdendo a oportunidade de sincronizar.

## Solucao (3 camadas de protecao)

### 1. Invalidar mensagens quando a conversa atualizar
No hook `useConversations`, quando o canal realtime de `conversations` detectar mudanca, tambem invalidar as mensagens da conversa ativa. Isso garante que quando o webhook do Baileys atualiza a conversa (novo `last_message_at`), as mensagens tambem sejam recarregadas.

### 2. Adicionar refetchInterval como fallback
Configurar um `refetchInterval` de 10 segundos no `useMessages` como rede de seguranca. Se o Realtime falhar, o polling garante que mensagens aparecam em no maximo 10s.

### 3. Manter o setQueryData para resposta instantanea
A assinatura Realtime com `setQueryData` continua como caminho primario para mostrar mensagens instantaneamente. As outras camadas sao fallback.

---

## Detalhes Tecnicos

**Arquivo:** `src/hooks/useConversations.ts`

### Mudanca 1 - useMessages: adicionar refetchInterval
```typescript
return useQuery({
  queryKey: ['messages', conversationId],
  queryFn: async () => { ... },
  enabled: !!conversationId,
  refetchInterval: 10000, // Fallback: refetch a cada 10s
});
```

### Mudanca 2 - useConversations: invalidar mensagens no realtime
Quando o canal de conversas receber um evento, alem de invalidar `['conversations']`, tambem invalidar todas as queries de mensagens:
```typescript
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'conversations',
}, () => {
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
  queryClient.invalidateQueries({ queryKey: ['messages'] }); // <-- novo
})
```

### Mudanca 3 - useMessages: tambem ouvir eventos sem filtro como backup
Adicionar uma segunda assinatura sem filtro de `conversation_id` que faz `invalidateQueries` em vez de `setQueryData`. Isso cobre o caso onde o filtro do Realtime falha:
```typescript
const backupChannel = supabase
  .channel(`messages-backup-${conversationId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
  }, (payload) => {
    if ((payload.new as any).conversation_id === conversationId) {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    }
  })
  .subscribe();
```

### Resultado esperado
- **Caminho rapido:** Realtime com `setQueryData` (instantaneo, <100ms)
- **Fallback 1:** Invalidacao quando conversa atualiza (1-2s)
- **Fallback 2:** Polling a cada 10 segundos (maximo 10s de atraso)

Nenhuma dessas mudancas afeta a performance negativamente - o polling so busca dados se a query estiver stale, e as invalidacoes sao operacoes leves.
