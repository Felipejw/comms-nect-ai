
# Correção: Player de áudio automático no servidor VPS

## Problema

Quando uma mensagem de áudio chega via WhatsApp no servidor VPS, o webhook do Baileys nem sempre inclui a URL da mídia. Sem `media_url`, o sistema exibe um fallback com texto "Mensagem de áudio" e um botão "Baixar" manual, em vez do player bonito com waveform.

Na Lovable, como os dados de teste já têm `media_url` preenchido, o AudioPlayer aparece normalmente.

## Solução

Fazer o download da mídia acontecer **automaticamente** quando uma mensagem de áudio sem `media_url` é exibida, eliminando a necessidade de clique manual.

## Detalhes Técnicos

**Arquivo:** `src/pages/Atendimento.tsx`

### Mudança: Auto-download de áudio sem media_url

Substituir o bloco estático de fallback (linhas 1086-1115) por um componente que:

1. Ao montar, detecta que `media_url` está vazio
2. Automaticamente chama a Edge Function `download-whatsapp-media`
3. Mostra um indicador de carregamento (spinner + "Carregando áudio...")
4. Quando o download termina e o banco é atualizado, a query é invalidada e o `AudioPlayer` aparece no lugar

```text
Fluxo atual:
  audio sem media_url -> texto "Mensagem de áudio" + botão Baixar (manual)

Fluxo novo:
  audio sem media_url -> spinner "Carregando áudio..." (auto-download)
  -> media_url preenchido -> AudioPlayer com waveform
```

### Implementação

Criar um pequeno componente inline `AudioAutoDownloader` que:
- Recebe `messageId`, `conversationId`, `sessionName`
- Usa `useEffect` para disparar o download automaticamente ao montar
- Controla estados: `loading`, `error`, `idle`
- Se falhar, mostra o fallback atual com botão manual de retry
- Se sucesso, invalida a query de mensagens (o que fará o AudioPlayer renderizar)

O componente ficará no mesmo arquivo `Atendimento.tsx` para manter a simplicidade.

### Resultado

- Áudios no servidor VPS carregam automaticamente e exibem o player bonito
- Se o download falhar, o botão manual de retry continua disponível
- Nenhuma mudança na experiência da Lovable (já funciona)
