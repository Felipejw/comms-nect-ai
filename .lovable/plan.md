

# Fix: Mensagens nao aparecem e numero incorreto

## Problemas Identificados

Foram encontrados **3 problemas** que precisam ser corrigidos:

### 1. Mensagem nao e salva no banco de dados
O log da Edge Function mostra o erro:
```text
Could not find the 'external_id' column of 'messages' in the schema cache
```
O webhook tenta inserir um campo `external_id` na tabela `messages`, mas essa coluna nao existe. Por isso a mensagem "Ola" nunca foi gravada, e a conversa aparece vazia.

### 2. Numero de telefone e na verdade um LID (identificador interno do WhatsApp)
O numero `249687990878288` nao e um telefone real -- e um LID (Linked ID) do WhatsApp. O webhook recebe `from: "249687990878288@lid"` e remove apenas o `@lid`, armazenando o LID como se fosse um telefone. O sistema deveria:
- Detectar o sufixo `@lid` no campo `from`
- Armazenar o valor no campo `whatsapp_lid` do contato (em vez do campo `phone`)
- Marcar o contato como "LID-only" para que o alerta apareca na tela

Atualmente, o detector `isLidOnlyContact` so identifica numeros com mais de 15 digitos, mas este LID tem exatamente 15, passando despercebido.

### 3. Nao consegue enviar mensagens
A chamada ao `send-whatsapp` falha com "Failed to fetch" (timeout). Alem disso, o LID armazenado como telefone passa pela validacao de tamanho (10-15 chars), mas nao e um numero real de telefone, entao o Baileys nao conseguiria enviar a mensagem para ele.

## Plano de Correcao

### Etapa 1: Adicionar coluna delivery_status na tabela messages (migracao)
Remover a referencia ao campo `external_id` no webhook e garantir que a mensagem seja salva com os campos corretos.

### Etapa 2: Corrigir o webhook para tratar LID corretamente
**Arquivo:** `supabase/functions/baileys-webhook/index.ts`

- Remover `external_id` do insert na tabela messages (campo nao existe)
- Detectar se o `from` termina em `@lid` no payload original
- Se for LID: armazenar no campo `whatsapp_lid` do contato e deixar `phone` como `null`
- Se for numero real: armazenar no campo `phone` normalmente

### Etapa 3: Corrigir a deteccao de LID no frontend
**Arquivo:** `src/components/atendimento/LidContactIndicator.tsx`

- Ajustar a funcao `isLidOnlyContact` para tambem detectar o contato atual que tem um LID armazenado como phone (numero `249687990878288`)
- Contatos sem phone E sem whatsapp_lid tambem devem ser tratados

### Etapa 4: Corrigir o send-whatsapp para LID
**Arquivo:** `supabase/functions/send-whatsapp/index.ts`

- Quando o contato so tem LID, tentar enviar usando o LID diretamente via Baileys (o protocolo suporta envio para LID com sufixo `@lid`)
- Melhorar os logs para diagnostico

### Etapa 5: Corrigir o contato existente no banco
Atualizar o contato `249687990878288` para mover o LID para o campo correto:
- Mover `phone` para `whatsapp_lid`
- Limpar `phone` (sera preenchido quando o numero real for descoberto)

## Detalhes Tecnicos

### Alteracoes no banco de dados:
```text
UPDATE contacts 
SET whatsapp_lid = phone, phone = NULL 
WHERE phone = '249687990878288';
```

### Alteracoes no webhook (baileys-webhook):
```text
// Antes:
const from = msg.from?.replace("@s.whatsapp.net", "").replace("@g.us", "") || "";

// Depois:
const rawFrom = msg.from || "";
const isLid = rawFrom.endsWith("@lid");
const from = rawFrom.replace("@s.whatsapp.net", "").replace("@g.us", "").replace("@lid", "");

// Na criacao do contato:
if (isLid) {
  // Armazenar como whatsapp_lid, nao como phone
  contact = await createContact({ whatsapp_lid: from, phone: null, ... });
} else {
  contact = await createContact({ phone: from, ... });
}
```

### Alteracoes no insert de mensagens:
```text
// Remover external_id que nao existe na tabela
const { error } = await supabaseClient.from("messages").insert({
  conversation_id: conversation.id,
  content: body,
  message_type: messageType,
  media_url: mediaUrl,
  sender_type: "contact",
  // external_id: messageId,  <-- REMOVER
  is_read: false,
});
```

### Alteracoes no send-whatsapp:
```text
// Para contatos LID, enviar com sufixo @lid
if (whatsappLid && (!phone || phone.length > 15)) {
  phoneToSend = whatsappLid;
  // Enviar para LID@lid no Baileys
}
```

## Arquivos a modificar:
- `supabase/functions/baileys-webhook/index.ts` -- corrigir insert e tratamento de LID
- `supabase/functions/send-whatsapp/index.ts` -- suportar envio para LID
- `src/components/atendimento/LidContactIndicator.tsx` -- melhorar deteccao de LID
- Migracao SQL para corrigir o contato existente

## Resultado esperado:
Apos as correcoes:
1. Mensagens recebidas serao salvas corretamente no banco
2. Contatos LID serao identificados e marcados com o alerta
3. O sistema tentara resolver o numero real automaticamente
4. Envio de mensagens funcionara tanto para numeros reais quanto para LIDs
