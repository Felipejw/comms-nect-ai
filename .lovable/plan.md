

# Correcao: RLS de Upload + Visual do Audio

## Problema 1: "new row violates row-level security policy"

O bucket `whatsapp-media` tem politica de INSERT sem restricao de role (`WITH CHECK (bucket_id = 'whatsapp-media')`) -- isso funciona apenas para `service_role`, nao para usuarios autenticados via frontend. O bucket `chat-attachments` tem a politica correta (`TO authenticated`).

**Solucao**: Inverter a prioridade no `useFileUpload.ts` -- tentar `chat-attachments` primeiro (que tem politica correta para usuarios autenticados), e usar `whatsapp-media` como fallback. Alem disso, tambem aceitar erros de "security policy" como sinal para tentar o proximo bucket.

## Problema 2: Texto "[Audio]" aparecendo abaixo do player

Na renderizacao de mensagens (Atendimento.tsx, linha 1092), o `message.content` e exibido para TODAS as mensagens, incluindo audio. Quando o webhook salva uma mensagem de audio, o content vem como "[Audio]" -- e esse texto aparece abaixo do player/downloader, ficando feio.

**Solucao**: Esconder o `message.content` quando `message_type` for "audio", "image" ou "video" E o conteudo for um placeholder generico como "[Audio]", "[Imagem]", "[Video]", etc.

---

## Detalhes Tecnicos

### Arquivo 1: `src/hooks/useFileUpload.ts`

- Inverter prioridade: `chat-attachments` como primario (tem RLS correta para authenticated)
- `whatsapp-media` como fallback
- Incluir "security" e "policy" na lista de erros que disparam fallback

### Arquivo 2: `src/pages/Atendimento.tsx`

- Na linha 1092, adicionar condicao para esconder o content quando for placeholder de midia:
  - Nao mostrar content se `message_type !== 'text'` E content for `[Audio]`, `[Áudio]`, `[Imagem]`, `[Image]`, `[Video]`, `[Vídeo]`, `[Documento]`, `[Document]`

### Resumo

| Arquivo | Acao |
|---------|------|
| `src/hooks/useFileUpload.ts` | Inverter prioridade de buckets e melhorar deteccao de erros |
| `src/pages/Atendimento.tsx` | Esconder placeholder de midia no content |

