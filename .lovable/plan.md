
# Atualização em tempo real mais rápida (1 segundo)

## Situação atual

O sistema já tem duas camadas de atualização:
1. **Realtime (WebSocket)** - deveria ser instantâneo, mas no VPS nem sempre funciona
2. **Polling** - atualmente a cada 5 segundos como fallback

## O que será feito

Reduzir o intervalo de polling de **5 segundos para 1 segundo** na conversa ativa, garantindo que mensagens novas apareçam quase instantaneamente mesmo quando o realtime falha.

Para a lista de conversas, manter um intervalo um pouco maior (3 segundos) para não sobrecarregar o banco.

## Detalhes técnicos

### Arquivo: `src/hooks/useConversations.ts`

| Alteração | Antes | Depois |
|-----------|-------|--------|
| Polling de mensagens (`useMessages`) | 5000ms | 1000ms |
| Polling da lista de conversas (`useConversations`) | sem polling | 3000ms |
