

# Correção completa: Player de áudio automatico + Status Card

## Resumo

Tres frentes de trabalho para alinhar o comportamento de audio entre VPS e Lovable:

1. **Componente `MediaAutoDownloader` generico** - Substitui o `AudioAutoDownloader` atual e tambem cobre imagem e video
2. **Melhoria no `useFileUpload`** - Garantir que o upload de audio gravado funcione com fallback
3. **Card de status de processamento de audio** - Indicador visual no painel de conversa

---

## Detalhes Tecnicos

### 1. Componente `MediaAutoDownloader` (refatorar `AudioAutoDownloader`)

**Arquivo:** `src/components/atendimento/MediaAutoDownloader.tsx` (novo)

Extrair o componente do Atendimento.tsx para um arquivo proprio, tornando-o generico para qualquer tipo de midia:

- Props: `messageId`, `conversationId`, `sessionName`, `mediaType` (audio | image | video | document)
- Auto-download via `useEffect` ao montar
- Maximo de 3 tentativas automaticas com delay exponencial (2s, 4s, 8s)
- Estados visuais:
  - `loading`: spinner + "Carregando audio/imagem/video..."
  - `error`: icone + texto + botao "Tentar novamente"
  - `success`: nada (a query e invalidada e o componente pai renderiza o player/imagem/video)
- Para audio especificamente, mostra o `AudioPlayer` inline ao obter a URL (sem depender de invalidar query)

### 2. Atualizar `src/pages/Atendimento.tsx`

- Remover o `AudioAutoDownloader` inline
- Importar o novo `MediaAutoDownloader`
- Usar `MediaAutoDownloader` nos tres blocos de fallback (audio, imagem, video) substituindo tanto o `AudioAutoDownloader` quanto os blocos manuais com botao "Baixar"
- Adicionar o card de status de processamento (item 4)

### 3. Ajuste no `src/hooks/useFileUpload.ts`

- Sem mudancas estruturais - o fluxo de fallback com `chat-attachments` -> `admin-write` -> `whatsapp-media` ja esta correto
- Adicionar log mais claro no catch para facilitar diagnostico no VPS

### 4. Card de status de processamento de audio

**Arquivo:** `src/components/atendimento/AudioProcessingStatus.tsx` (novo)

Um componente leve que aparece no topo da area de mensagens quando existem mensagens de audio pendentes (sem `media_url`) na conversa atual:

```text
+------------------------------------------+
| 🔄 2 audios sendo processados...         |
| ✅ 5 audios prontos                       |
+------------------------------------------+
```

- Conta mensagens de audio da conversa atual com e sem `media_url`
- Aparece apenas quando ha audios pendentes (count > 0)
- Usa dados ja disponíveis no array `messages` (sem queries extras)
- Estilo compacto usando cores `muted` para nao poluir a interface

### Fluxo final

```text
Mensagem de audio chega sem media_url:
  1. MediaAutoDownloader monta automaticamente
  2. Chama download-whatsapp-media (ate 3 tentativas)
  3. Se sucesso: atualiza messages.media_url -> invalida query -> AudioPlayer renderiza
  4. Se falha: mostra botao "Tentar novamente"
  5. Card no topo mostra "X audios sendo processados..."

Upload de audio pelo usuario:
  1. Grava audio no navegador
  2. useFileUpload tenta chat-attachments
  3. Se bucket nao existe: cria via admin-write ou usa whatsapp-media
  4. Envia mensagem com media_url preenchida
```

### Arquivos modificados/criados

| Arquivo | Acao |
|---------|------|
| `src/components/atendimento/MediaAutoDownloader.tsx` | Criar |
| `src/components/atendimento/AudioProcessingStatus.tsx` | Criar |
| `src/pages/Atendimento.tsx` | Editar (remover AudioAutoDownloader, importar novos componentes, adicionar status card) |

