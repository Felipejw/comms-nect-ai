

# Correção: QR Code não aparece na tela

## Problema
O servidor Baileys gera o QR Code corretamente, mas as Edge Functions usam nomes de campos diferentes dos que o servidor envia. Por isso o QR Code nunca chega à tela.

## O que será corrigido

### 1. Arquivo `supabase/functions/baileys-instance/index.ts`
O código atual procura o QR Code no campo `result.qr`, mas o servidor Baileys retorna no campo `result.data.qrCode`.

**Antes:**
```text
if (result.success && result.qr) {
  // salva result.qr no banco
}
```

**Depois:**
```text
const qrValue = (result.data as any)?.qrCode || result.qr;
if (result.success && qrValue) {
  // salva qrValue no banco
}
```

### 2. Arquivo `supabase/functions/baileys-webhook/index.ts`
O webhook recebe o campo `qrCode` do servidor, mas o código procura por `qr`.

**Antes:**
```text
const qrCode = eventPayload?.qr || eventPayload;
```

**Depois:**
```text
const qrCode = eventPayload?.qrCode || eventPayload?.qr || eventPayload;
```

## Por que isso resolve
Os logs do servidor mostram que:
- O QR Code é gerado com sucesso (`"QR Code generated"`)
- O webhook é enviado com sucesso (`"Webhook sent successfully"`)
- Mas os nomes dos campos não batem entre servidor e funções

Com a correção, as funções aceitam ambos os formatos de campo, garantindo compatibilidade.

## Detalhes Técnicos

Formato real do servidor Baileys:

Endpoint QR (`GET /sessions/{name}/qr`):
```text
{ "success": true, "data": { "qrCode": "data:image/png;base64,..." } }
```

Webhook (`qr.update`):
```text
{ "event": "qr.update", "payload": { "qrCode": "data:image/png;base64,..." } }
```

## Após a correção
Será necessário fazer o rebuild e deploy na VPS para que as alterações entrem em vigor.

