
# Corrigir matching de sessao no webhook do Baileys

## Problema identificado
O servidor Baileys gera o QR Code corretamente e envia via webhook com `session: "Teste"`. Porem, o webhook procura conexoes onde `session_data.sessionName === "Teste"`, mas no banco de dados a conexao "Teste" tem `session_data.sessionName = "teste_1770351229623"`. O matching falha e o QR Code e descartado com a mensagem "Connection not found for session: Teste".

## Causa raiz
A sessao foi criada no Baileys com um nome diferente do que esta registrado no banco. Isso pode acontecer quando:
- A sessao e criada manualmente via terminal
- O script de instalacao cria a sessao com um nome, mas o banco registra outro
- Uma reconexao usa o nome da conexao em vez do sessionName salvo

## Solucao

### 1. Melhorar o matching no webhook (arquivo: `supabase/functions/baileys-webhook/index.ts`)
Atualmente o webhook so faz matching por `session_data.sessionName`. A correcao adiciona fallbacks:
- Primeiro tenta `session_data.sessionName === session` (comportamento atual)
- Se nao encontrar, tenta `connection.name === session` (fallback por nome da conexao)
- Se nao encontrar, tenta matching case-insensitive em ambos os campos

Trecho a alterar (linhas 231-246):
```typescript
// Find connection by session name (with fallback matching)
const { data: connections } = await supabaseClient
  .from("connections")
  .select("*")
  .eq("type", "whatsapp");

const connection = connections?.find((c) => {
  const sessionData = c.session_data;
  // Primary: match by sessionName in session_data
  if (sessionData?.sessionName === session) return true;
  // Fallback 1: match by connection name (exact)
  if (c.name === session) return true;
  // Fallback 2: case-insensitive match
  if (sessionData?.sessionName?.toLowerCase() === session.toLowerCase()) return true;
  if (c.name?.toLowerCase() === session.toLowerCase()) return true;
  return false;
});
```

### 2. Quando o webhook encontrar via fallback, atualizar o session_data (auto-correcao)
Apos encontrar a conexao por fallback, o webhook atualiza `session_data.sessionName` para o nome correto que o Baileys esta usando. Isso corrige o problema permanentemente para aquela conexao.

```typescript
if (connection) {
  const sessionData = connection.session_data;
  // Auto-fix: if matched by fallback, update sessionName to match Baileys
  if (sessionData?.sessionName !== session) {
    console.log(`[Baileys Webhook] Auto-fixing sessionName: ${sessionData?.sessionName} -> ${session}`);
    await supabaseClient
      .from("connections")
      .update({
        session_data: { ...sessionData, sessionName: session },
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
  }
}
```

## Secao tecnica

### Arquivo modificado
- `supabase/functions/baileys-webhook/index.ts` (linhas 231-246)

### Logica de matching (ordem de prioridade)
1. `session_data.sessionName === session` (exato)
2. `connection.name === session` (nome da conexao)
3. `session_data.sessionName.toLowerCase() === session.toLowerCase()` (case-insensitive)
4. `connection.name.toLowerCase() === session.toLowerCase()` (case-insensitive)

### Auto-correcao
Quando o matching acontece via fallback (opcoes 2-4), o webhook automaticamente atualiza o `session_data.sessionName` para o valor correto, evitando o problema em chamadas futuras.

### Impacto
- Zero breaking changes - o matching primario continua identico
- A Edge Function sera reimplantada automaticamente
- Conexoes existentes serao auto-corrigidas na proxima chamada de webhook
