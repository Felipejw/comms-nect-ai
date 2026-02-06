

# Resolucao automatica de LID para numero real

## Contexto

O WhatsApp usa "LIDs" (Linked Device IDs) como identificadores internos que nao correspondem ao numero de telefone real do contato. Atualmente, quando um contato envia mensagem com LID, o sistema armazena o LID mas nao tenta resolver automaticamente o numero real.

## Estrategia de resolucao

A resolucao automatica funcionara em **3 camadas complementares**:

1. **Camada 1 - Baileys Server**: Enviar o `remoteJid` completo (com sufixo `@lid`) no webhook, para que o sistema saiba exatamente o tipo de identificador. Tambem tentar extrair informacoes extras do protocolo (participant, etc).

2. **Camada 2 - Webhook (baileys-webhook)**: Ao receber uma mensagem de um contato LID, disparar a resolucao como tarefa em background (usando `EdgeRuntime.waitUntil`), sem bloquear o salvamento da mensagem.

3. **Camada 3 - Merge por pushName**: Quando um contato envia uma mensagem de um numero real (`@s.whatsapp.net`), verificar se existe algum contato LID-only com o mesmo `pushName` e fazer o merge automaticamente.

## Alteracoes detalhadas

### 1. Baileys Server - `deploy/baileys/src/baileys.ts`

**Funcao `processIncomingMessage` (linha 224):**
- Enviar o `remoteJid` completo no campo `from` do payload (atualmente remove `@s.whatsapp.net` e `@g.us` mas nao `@lid`)
- Adicionar campo `rawJid` com o JID original completo para que o webhook tenha toda a informacao
- Incluir campo `participant` se disponivel (util em contextos de grupo)

```text
// Antes:
const from = msg.key.remoteJid?.replace('@s.whatsapp.net', '').replace('@g.us', '') || '';

// Depois:
const rawJid = msg.key.remoteJid || '';
const from = rawJid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '');

// No payload:
payload.payload.rawJid = rawJid;
payload.payload.participant = msg.key.participant || null;
```

**Funcao `formatJid` (linha 444):**
- Tratar LIDs corretamente: se o numero ja contem `@lid`, nao adicionar `@s.whatsapp.net`

```text
function formatJid(number: string): string {
  if (number.includes('@')) return number;
  const clean = number.replace(/\D/g, '');
  return `${clean}@s.whatsapp.net`;
}
```
(Ja funciona corretamente -- se receber `249687990878288@lid`, retorna como esta)

### 2. Edge Function - `supabase/functions/baileys-webhook/index.ts`

**Adicionar resolucao em background apos salvar mensagem de contato LID:**

Apos salvar a mensagem com sucesso para um contato LID, disparar a resolucao como background task:

```text
// Apos salvar a mensagem para contato LID
if (isLid && contact.id) {
  EdgeRuntime.waitUntil(
    resolveLidInBackground(supabaseClient, contact.id, from, connection)
  );
}
```

**Nova funcao `resolveLidInBackground`:**
- Buscar a URL do servidor Baileys nas configuracoes
- Tentar resolver o LID via endpoint `/contacts` do Baileys
- Se encontrar o numero real, atualizar o contato no banco

**Adicionar merge por pushName para mensagens de numero real:**

Quando uma mensagem chega de um numero real (`@s.whatsapp.net`) com `pushName`, verificar se existe um contato LID-only com o mesmo nome:

```text
// Se a mensagem veio de numero real e tem pushName
if (!isLid && msg.pushName) {
  // Buscar contatos LID-only com mesmo nome
  const { data: lidContacts } = await supabaseClient
    .from("contacts")
    .select("id, whatsapp_lid, phone")
    .eq("name", msg.pushName)
    .is("phone", null)
    .not("whatsapp_lid", "is", null);
  
  if (lidContacts?.length === 1) {
    // Merge: atualizar o contato LID com o numero real
    await supabaseClient.from("contacts")
      .update({ phone: from })
      .eq("id", lidContacts[0].id);
    
    // Usar o contato LID como contato principal (ja tem conversas)
    contact = { ...lidContacts[0], phone: from };
  }
}
```

### 3. Edge Function - `supabase/functions/send-whatsapp/index.ts`

**Funcao `sendViaBaileys` (linha 80-91):**
- Para contatos LID, formatar o numero com sufixo `@lid` antes de enviar ao Baileys
- Isso garante que o Baileys use o endereco LID correto

```text
if (isLidSend) {
  // Enviar com sufixo @lid para que o Baileys use o protocolo LID
  formattedNumber = `${phoneToSend.replace(/\D/g, '')}@lid`;
  console.log(`[Baileys] Sending to LID: ${formattedNumber}`);
}
```

### 4. Frontend - Sem alteracoes necessarias

O componente `LidContactIndicator` ja faz busca automatica ao abrir a conversa. Com as alteracoes no backend, a resolucao tambem acontecera automaticamente ao receber novas mensagens, e o frontend ira refletir a mudanca via invalidacao de queries.

## Fluxo completo apos implementacao

```text
Cenario 1: Contato envia mensagem com LID
  WhatsApp -> Baileys -> webhook (salva mensagem + contato LID)
                                  -> background: tenta resolver LID via Baileys API
                                      -> Se encontrar numero: atualiza contato
                                      -> Se nao: mantem como LID (usuario pode enviar normalmente)

Cenario 2: Contato previamente LID envia de numero real
  WhatsApp -> Baileys -> webhook (detecta numero real)
                                  -> Busca contatos LID com mesmo pushName
                                  -> Se encontrar match: merge (atualiza phone no contato LID)
                                  -> Resultado: contato ganha numero real automaticamente

Cenario 3: Envio para contato LID
  UI -> send-whatsapp -> detecta LID -> formata como {id}@lid -> Baileys -> WhatsApp
```

## Arquivos a modificar
- `deploy/baileys/src/baileys.ts` -- enviar rawJid e participant no webhook + formatJid para LID
- `supabase/functions/baileys-webhook/index.ts` -- resolucao em background + merge por pushName
- `supabase/functions/send-whatsapp/index.ts` -- formatar LID com sufixo `@lid` para envio

## Resultado esperado
1. Quando um contato LID envia uma nova mensagem, o sistema tenta resolver o numero real automaticamente em background
2. Quando um contato que era LID envia de um numero real, o sistema faz merge automatico
3. O envio de mensagens para LIDs funciona corretamente com o sufixo `@lid`
4. Nenhuma acao manual necessaria do usuario -- tudo acontece automaticamente

