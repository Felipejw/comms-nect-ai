

# Correcao: Mensagens Enviadas no WhatsApp e Audio Nao Aparecem

## Problemas Encontrados

### Problema 1 - Mensagens enviadas diretamente no WhatsApp nao aparecem

As mensagens que voce envia pelo WhatsApp (no celular) sao bloqueadas em **dois niveis**:

1. **Servidor Baileys** (`deploy/baileys/src/baileys.ts`, linha 196): O servidor filtra mensagens com `fromMe: true` e nunca as envia ao webhook
2. **Edge Function Webhook** (`supabase/functions/baileys-webhook/index.ts`, linha 320-326): Mesmo que chegassem, o webhook tambem as descarta

Resultado: mensagens enviadas pelo celular nunca sao salvas no banco de dados.

### Problema 2 - Audio recebido nao aparece

O audio chega com o formato `data:audio/ogg; codecs=opus;base64,T2dn...`. A funcao `storeMediaFromBase64` usa uma regex que nao consegue lidar com mimetypes que contem parametros (o `;` no `audio/ogg; codecs=opus` quebra o parsing):

```text
Regex atual: /^data:([^;]+);base64,(.+)$/
Dado real:   data:audio/ogg; codecs=opus;base64,T2dn...

A regex para no primeiro ";" e espera "base64," logo depois,
mas encontra " codecs=opus;base64," -- falha no match.
```

Resultado: `media_url` fica `null` no banco, e o audio nunca e exibido.

### Problema 3 - Frontend nao mostra audio sem media_url

Na tela de Atendimento (linha 1041):
```text
{message.message_type === "audio" && message.media_url && (
  <AudioPlayer ... />
)}
```

Se `media_url` e `null` E `content` e vazio (audio nao tem texto), a bolha da mensagem fica completamente invisivel.

---

## Plano de Correcao

### Correcao 1 - Servidor Baileys: Enviar mensagens fromMe ao webhook

**Arquivo**: `deploy/baileys/src/baileys.ts`

Remover o filtro `if (msg.key.fromMe) continue` na linha 196 para que mensagens enviadas pelo usuario tambem sejam processadas e enviadas ao webhook. Manter apenas o filtro de `status@broadcast`.

### Correcao 2 - Webhook: Salvar mensagens fromMe como "agent"

**Arquivo**: `supabase/functions/baileys-webhook/index.ts`

Em vez de ignorar mensagens `fromMe`, salva-las com `sender_type: "agent"` e `is_read: true`. Isso permite que apareçam no chat como mensagens enviadas pelo atendente.

Logica:
- Se `fromMe = true`: salvar com `sender_type: "agent"`, `is_read: true`
- Se `fromMe = false`: manter comportamento atual (`sender_type: "contact"`, `is_read: false`)

### Correcao 3 - Webhook: Corrigir regex para mimetypes com parametros

**Arquivo**: `supabase/functions/baileys-webhook/index.ts`

Atualizar a regex na funcao `storeMediaFromBase64` para aceitar mimetypes com parametros:

```text
Regex atual:  /^data:([^;]+);base64,(.+)$/
Regex nova:   /^data:([^;,]+(?:;[^;,]*)*?);base64,(.+)$/

Essa nova regex aceita:
- data:audio/ogg;base64,...
- data:audio/ogg; codecs=opus;base64,...
- data:image/jpeg;base64,...
```

Tambem ajustar a extracao do mimetype para pegar apenas a parte principal (antes dos parametros): `audio/ogg; codecs=opus` -> `audio/ogg`

### Correcao 4 - Frontend: Fallback para audio sem media_url

**Arquivo**: `src/pages/Atendimento.tsx`

Adicionar indicador visual quando a mensagem e do tipo "audio" mas nao tem `media_url`:

```text
{message.message_type === "audio" && !message.media_url && (
  <div className="flex items-center gap-2 p-2 ...">
    <Mic className="w-4 h-4" />
    <span>Audio</span>
  </div>
)}
```

---

## Detalhes Tecnicos

### Baileys Server (deploy/baileys/src/baileys.ts)

Linha 194-196 - Antes:
```text
for (const msg of messages) {
  if (!msg.key || msg.key.fromMe) continue;
  if (msg.key.remoteJid === 'status@broadcast') continue;
```

Depois:
```text
for (const msg of messages) {
  if (!msg.key) continue;
  if (msg.key.remoteJid === 'status@broadcast') continue;
```

### Webhook - fromMe handling (baileys-webhook/index.ts)

Linhas 320-326 - Antes:
```text
if (msg.fromMe) {
  console.log("[Baileys Webhook] Skipping outgoing message");
  return new Response(...);
}
```

Depois:
```text
const isFromMe = msg.fromMe || false;
if (isFromMe) {
  console.log("[Baileys Webhook] Processing outgoing (fromMe) message");
}
```

E na insercao da mensagem (linha 515-523):
```text
sender_type: isFromMe ? "agent" : "contact",
is_read: isFromMe ? true : false,
```

Tambem nao incrementar unread_count para mensagens fromMe e nao disparar resolucao de LID.

### Webhook - Regex do base64 (baileys-webhook/index.ts)

Linha 44 - Antes:
```text
const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
```

Depois:
```text
const matches = base64Data.match(/^data:([\w\/\-\+\.]+(?:;\s*[\w\-]+=[\w\-]+)*);base64,(.+)$/);
if (!matches) return null;
const fullMimetype = matches[1];
const mimetype = fullMimetype.split(';')[0].trim();
```

### Frontend - Audio fallback (Atendimento.tsx)

Adicionar entre as linhas 1043-1044:
```text
{message.message_type === "audio" && !message.media_url && (
  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
    <Mic className="w-4 h-4 text-muted-foreground" />
    <span className="text-sm text-muted-foreground">Mensagem de audio</span>
  </div>
)}
```

## Resultado Esperado

- Mensagens enviadas diretamente no WhatsApp aparecerao no chat como mensagens do atendente
- Audios recebidos serao armazenados corretamente e exibidos com o player de audio
- Audios antigos (sem media_url) mostrarao um indicador visual em vez de bolha vazia
- IMPORTANTE: O servidor Baileys no VPS precisara ser atualizado e reiniciado para que a Correcao 1 tenha efeito (deploy/baileys e um projeto separado rodando no seu servidor)

