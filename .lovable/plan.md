
# Plano: Corrigir Carregamento do QR Code - Análise Completa

## Diagnóstico Detalhado

### Fluxo Atual (com problema)

```text
1. Frontend chama recreateConnection/createConnection
2. Edge function baileys-instance cria sessão no servidor Baileys (VPS)
3. Servidor Baileys gera QR Code e armazena em memória
4. Servidor Baileys TENTA enviar webhook para baileys-webhook ← FALHA AQUI
5. Frontend faz polling, chama getQrCode
6. Edge function busca QR do servidor: GET /sessions/teste/qr ← PROBLEMA AQUI
7. Servidor responde que não tem QR disponível
```

### Problemas Identificados

**Problema 1: sessionName desatualizado**
- O banco tem `sessionName: "teste"`
- Mas quando você clicou em "Reconectar", a edge function `recreate` criou uma NOVA sessão com nome `teste_{timestamp}` (linha 350 de baileys-instance)
- A sessão antiga "teste" foi deletada
- O banco NÃO foi atualizado corretamente com o novo sessionName

**Problema 2: Webhook não está sendo recebido**
- Não há logs de `baileys-webhook` sendo chamado
- Isso significa que o servidor Baileys não consegue alcançar a URL do Supabase
- Possíveis causas:
  - Certificado SSL/TLS
  - Firewall bloqueando saída
  - URL incorreta do webhook

**Problema 3: Polling não atualiza o banco após buscar QR**
- A edge function `getQrCode` busca o QR do servidor Baileys
- O servidor retorna "QR Code not available" porque a sessão que existe no servidor tem outro nome

### Evidências

| Dado | Valor |
|------|-------|
| sessionName no banco | `teste` |
| Sessões ativas no servidor | 1 (provavelmente com nome diferente como `teste_1738636668662`) |
| Logs do baileys-webhook | Nenhum log encontrado |
| Resposta do getQrCode | `"error": "QR Code not available"` |

## Solução Proposta

### 1. Corrigir sincronização do sessionName na action "recreate"

**Arquivo:** `supabase/functions/baileys-instance/index.ts`

O código atual cria uma nova sessão mas pode falhar em atualizar o banco se a criação no servidor Baileys falhar. Precisamos garantir que:
1. A sessão é criada com sucesso no servidor
2. O sessionName é atualizado no banco ANTES de tentar buscar o QR

### 2. Buscar QR diretamente da resposta da criação

**Arquivo:** `supabase/functions/baileys-instance/index.ts`

Após criar a sessão, aguardar um momento e buscar o QR imediatamente, salvando-o no banco.

### 3. Implementar fallback no polling

**Arquivo:** `src/pages/Conexoes.tsx`

Se o QR não estiver disponível após várias tentativas, tentar recriar a sessão automaticamente.

### 4. Verificar e logar erros do webhook

**Arquivo:** `supabase/functions/baileys-webhook/index.ts`

Adicionar mais logs para entender se o webhook está sendo chamado mas falhando silenciosamente.

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/baileys-instance/index.ts` | Buscar QR imediatamente após criar sessão; melhorar tratamento de erros |
| `src/pages/Conexoes.tsx` | Após getQrCode suceder, atualizar o state local com o QR |

## Detalhes Técnicos

### Modificação 1: baileys-instance - Action "getQrCode"

Atualmente, quando o QR é buscado com sucesso, ele é salvo no banco, mas o frontend não recebe essa atualização imediatamente porque só chama `refetch()` que busca de novo do banco.

O problema é que a busca retorna "QR Code not available" porque:
- A sessão no servidor tem nome diferente do armazenado no banco
- OU a sessão ainda não gerou o QR

### Modificação 2: baileys-instance - Action "create" e "recreate"

Após criar a sessão, aguardar 2-3 segundos e fazer uma chamada para buscar o QR, salvando-o diretamente no banco.

```typescript
// Após criar sessão com sucesso, aguardar e buscar QR
await new Promise(resolve => setTimeout(resolve, 3000));

// Buscar QR do servidor
const qrResponse = await fetch(`${baileysUrl}/sessions/${newSessionName}/qr`, {
  method: "GET",
  headers,
});

const qrResult = await qrResponse.json();

if (qrResult.success && qrResult.data?.qrCode) {
  await supabaseClient
    .from("connections")
    .update({ 
      qr_code: qrResult.data.qrCode,
      updated_at: new Date().toISOString() 
    })
    .eq("id", connectionId);
}
```

### Modificação 3: Conexoes.tsx - Polling melhorado

Quando `getQrCode.mutateAsync()` é chamado, se tiver sucesso, forçar um refetch imediato.

## Causa Raiz Principal

O servidor Baileys no VPS não está conseguindo enviar webhooks para a edge function `baileys-webhook` do Supabase. Isso pode ser verificado:

1. No VPS, execute:
```bash
curl -X POST https://qducanwbpleoceynmend.supabase.co/functions/v1/baileys-webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"test","session":"teste","payload":{}}'
```

2. Se falhar, pode ser problema de DNS ou certificado SSL no Docker

**Solução Alternativa:** Em vez de depender do webhook, fazer o frontend buscar ativamente o QR do servidor Baileys através da edge function.

## Próximos Passos

1. Aprovar este plano
2. Modificar a edge function baileys-instance para buscar o QR imediatamente após criar/recriar sessão
3. Testar clicando em "Reconectar"
4. Verificar se o QR Code aparece

