

## Corrigir recebimento de mensagens WhatsApp na VPS

### Contexto

O sistema esta instalado na VPS com todos os containers Docker rodando. O Baileys envia webhooks para `http://kong:8000/functions/v1/baileys-webhook` (rota interna Docker), que e o correto. O problema esta no codigo da Edge Function que processa esses webhooks.

### Problemas identificados (4 bugs no codigo)

---

#### Bug 1: Conexao nunca e encontrada (CRITICO)

**Arquivo:** `supabase/functions/baileys-webhook/index.ts` (linha 239)

O filtro exige `sessionData?.engine === "baileys"`, mas a conexao "BR" no banco tem `session_data: {sessionName: "BR"}` -- sem o campo `engine`. Resultado: **todas as mensagens sao ignoradas** com log "Connection not found".

**Correcao:** Remover o filtro `engine`:
```text
// De:
return sessionData?.sessionName === session && sessionData?.engine === "baileys";
// Para:
return sessionData?.sessionName === session;
```

---

#### Bug 2: QR Code nao e salvo via webhook

**Arquivo:** `supabase/functions/baileys-webhook/index.ts` (linha 253)

O servidor Baileys envia `{ qrCode: "data:image/png;base64,..." }` mas o handler verifica `eventPayload?.qr`.

**Correcao:** Adicionar `qrCode` como campo prioritario:
```text
const qrCode = eventPayload?.qrCode || eventPayload?.qr || eventPayload;
```

---

#### Bug 3: Numero de telefone nao e extraido ao conectar

**Arquivo:** `supabase/functions/baileys-webhook/index.ts` (linhas 284-286)

O servidor Baileys envia `{ status: "WORKING", me: { id: "5511999999999" } }` mas o handler so verifica `eventPayload?.phoneNumber`, que nao existe.

**Correcao:** Adicionar fallback para `me.id`:
```text
if (eventPayload?.phoneNumber) {
  updates.phone_number = eventPayload.phoneNumber;
} else if (eventPayload?.me?.id) {
  updates.phone_number = String(eventPayload.me.id).split(':')[0].replace('@s.whatsapp.net', '');
}
```

---

#### Bug 4: Midia (fotos, audios, videos) nao e armazenada

**Arquivo:** `supabase/functions/baileys-webhook/index.ts` (linhas 333-334)

O servidor Baileys envia a midia no campo `mediaUrl` (formato `data:image/jpeg;base64,...`), mas o handler so verifica `msgPayload.base64 || msgPayload.mediaData`. Alem disso, a condicao `hasMedia` do Baileys nao e verificada.

**Correcao:** Incluir `mediaUrl` nas verificacoes:
```text
// Linha 333 - condicao
if (msgPayload.hasMedia || msgPayload.mediaData || msgPayload.base64 || msgPayload.mediaUrl) {

// Linha 334 - dados
const base64Data = msgPayload.base64 || msgPayload.mediaData || msgPayload.mediaUrl;
```

---

### Correcao preventiva adicional

#### Salvar `engine` ao criar novas conexoes

**Arquivo:** `supabase/functions/baileys-instance/index.ts` (linha 106)

Para que futuras conexoes nao tenham o mesmo problema:
```text
session_data: { sessionName, engine: "baileys" },
```

---

### Secao tecnica

**Arquivos modificados:**
1. `supabase/functions/baileys-webhook/index.ts` -- 4 correcoes (linhas 239, 253, 284-286, 333-334)
2. `supabase/functions/baileys-instance/index.ts` -- 1 correcao (linha 106)

**Fluxo apos as correcoes:**
1. Mensagem chega no WhatsApp
2. Baileys processa e envia POST para `http://kong:8000/functions/v1/baileys-webhook`
3. Webhook encontra a conexao pelo `sessionName` (sem exigir `engine`)
4. Contato e criado/encontrado no banco
5. Conversa e criada/atualizada
6. Mensagem e salva e aparece no frontend

**Apos aplicar:** O usuario precisa atualizar os arquivos das Edge Functions na VPS (pull + restart do container functions) para que as correcoes entrem em vigor.

