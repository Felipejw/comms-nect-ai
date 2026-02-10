

## Corrigir status "Offline" e QR Code na pagina de Conexoes

### Problemas identificados

Tres bugs na integracao entre o frontend, a Edge Function e o servidor Baileys:

---

### Bug 1: Servidor mostra "Offline" mesmo estando online

**Arquivo:** `src/pages/Conexoes.tsx` (linha 64)

O frontend acessa `result.data?.status` mas o `checkServerHealth` retorna os campos diretamente na raiz (sem wrapper `data`). A Edge Function `serverHealth` retorna `{ success: true, status: "ok", sessions: 0 }`, entao o acesso correto e `result.status`.

**Correcao:** Trocar `result.data?.status` por `result.status`, e ajustar `result.data?.version` e `result.data?.sessions` da mesma forma.

---

### Bug 2: Endpoint de status usa URL incorreta (404)

**Arquivo:** `supabase/functions/baileys-instance/index.ts` (linha 237)

A Edge Function chama `GET /sessions/{name}/status` mas o servidor Baileys nao tem esse sufixo `/status`. O endpoint correto e `GET /sessions/{name}`.

**Correcao:** Trocar `/sessions/${sessionName}/status` por `/sessions/${sessionName}`.

Alem disso, a resposta do servidor retorna `{ success: true, data: { name, status, phoneNumber, hasQrCode } }`. O campo de status esta em `result.data.status`, nao em `result.status`. Ajustar o mapeamento nas linhas 245-257.

---

### Bug 3: QR Code nao e capturado corretamente

**Arquivo:** `supabase/functions/baileys-instance/index.ts` (linha 183)

A Edge Function verifica `result.qr` mas o servidor Baileys retorna o QR dentro de `result.data.qrCode` (formato: `{ success: true, data: { qrCode: "base64...", format: "base64" } }`).

**Correcao:** Trocar `result.qr` por `result.data?.qrCode` na verificacao e no update do banco.

---

### Secao tecnica - Alteracoes

#### 1. `src/pages/Conexoes.tsx` - funcao `fetchServerInfo` (~5 linhas)

```text
// De:
status: result.data?.status === 'ok' ? "online" : "offline",
version: result.data?.version || "Baileys",
sessionsCount: result.data?.sessions ?? 0,

// Para:
status: result.status === 'ok' ? "online" : "offline",
version: result.version || "Baileys",
sessionsCount: result.sessions ?? 0,
```

#### 2. `supabase/functions/baileys-instance/index.ts` - action "status" (~2 linhas)

Linha 237: Trocar URL de `/sessions/${sessionName}/status` para `/sessions/${sessionName}`

Linhas 245-257: Ajustar mapeamento para ler de `result.data` (ex: `result.data?.status` em vez de `result.status`)

#### 3. `supabase/functions/baileys-instance/index.ts` - action "getQrCode" (~2 linhas)

Linha 183: Trocar `result.qr` por `result.data?.qrCode`
Linha 188: Trocar `result.qr as string` por `result.data.qrCode as string`

### Resultado esperado

- Servidor Baileys aparece como **Online** na pagina de Conexoes
- Ao clicar em QR Code, o codigo e exibido corretamente
- Polling detecta quando o WhatsApp e escaneado e atualiza para "Conectado"

