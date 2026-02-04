
# Plano: Corrigir Criação/Reconexão de WhatsApp

## Diagnóstico Completo

### O que está acontecendo

1. **Conexão "TesteRapido" foi DELETADA** do banco - não existe mais
2. O modal mostrado na imagem é de uma conexão que não existe
3. A nova conexão "Gatteflow" (ID: c1812ae5...) existe e está em status "connecting"
4. Quando o usuário clica em "Tentar Novamente" no modal antigo, a action "recreate" retorna "Connection not found" porque a conexão não existe

### Verificação dos dados

| Conexão | ID | Existe no banco? |
|---------|-----|-----------------|
| TesteRapido | 40c578d7-5f8c-4a04-ad57-7397c14f2ad0 | NÃO |
| Gatteflow | c1812ae5-4de3-4cbe-98bc-5454d322eada | SIM |

### Logs relevantes

```text
Line 11-16: recreate action retornando "Connection not found"
Line 35: Create session failed: The signal has been aborted (timeout anterior)
```

## Problemas Identificados

1. **Modal mostrando conexão inexistente**: O frontend mantém `selectedConnection` de uma conexão que foi deletada. Quando faz refetch, a conexão não está mais na lista, mas o modal continua aberto com dados antigos.

2. **Action "recreate" ainda é SÍNCRONA**: Diferente da action "create" que foi corrigida para ser assíncrona, a action "recreate" ainda espera pela resposta do servidor Baileys de forma síncrona, podendo causar timeout.

## Solução

### 1. Corrigir action "recreate" para ser assíncrona

**Arquivo:** `supabase/functions/baileys-instance/index.ts`

Aplicar o mesmo padrão da action "create":
1. Atualizar banco PRIMEIRO com novo sessionName
2. Retornar resposta imediatamente
3. Criar sessão no Baileys em background

```typescript
// Atualizar banco PRIMEIRO
await supabaseClient
  .from("connections")
  .update({
    status: "connecting",
    qr_code: null,
    session_data: { sessionName: newSessionName, engine: "baileys" },
    updated_at: new Date().toISOString(),
  })
  .eq("id", connectionId);

// Criar sessão em background
const createBaileysSession = async () => {
  try {
    const response = await fetch(...);
    const result = await response.json();
    if (!result.success) {
      await supabaseClient.from("connections")
        .update({ status: "error" })
        .eq("id", connectionId);
    }
  } catch (err) {
    await supabaseClient.from("connections")
      .update({ status: "error" })
      .eq("id", connectionId);
  }
};

// Fire-and-forget
if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
  EdgeRuntime.waitUntil(createBaileysSession());
} else {
  createBaileysSession();
}

// Retornar imediatamente
return new Response(JSON.stringify({ success: true }), ...);
```

### 2. Frontend: Validar conexão antes de abrir modal

**Arquivo:** `src/pages/Conexoes.tsx`

Verificar se a conexão ainda existe antes de abrir o modal:

```typescript
// handleRefreshQrCode - verificar se conexão existe na lista
const handleRefreshQrCode = async (connection: WhatsAppConnection) => {
  // Verificar se conexão ainda existe
  const currentConnection = connections.find(c => c.id === connection.id);
  if (!currentConnection) {
    toast({
      title: "Conexão não encontrada",
      description: "Esta conexão não existe mais. Atualize a página.",
      variant: "destructive",
    });
    setIsQrModalOpen(false);
    setSelectedConnection(null);
    return;
  }
  // ...resto do código
};
```

### 3. Frontend: Sincronizar selectedConnection com lista

**Arquivo:** `src/pages/Conexoes.tsx`

Quando as conexões são atualizadas, verificar se a selectedConnection ainda existe:

```typescript
useEffect(() => {
  if (selectedConnection) {
    const exists = connections.find(c => c.id === selectedConnection.id);
    if (!exists) {
      setSelectedConnection(null);
      setIsQrModalOpen(false);
    } else if (exists.qr_code !== selectedConnection.qr_code) {
      setSelectedConnection(exists);
    }
  }
}, [connections]);
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/baileys-instance/index.ts` | Tornar action "recreate" assíncrona |
| `src/pages/Conexoes.tsx` | Validar conexão antes de operar, sincronizar selectedConnection |

## Fluxo Corrigido

```text
1. Usuário clica em "Reconectar" ou "Tentar Novamente"
2. Frontend verifica se conexão existe na lista
3. Edge function atualiza banco imediatamente
4. Edge function retorna sucesso (< 1 segundo)
5. Sessão é criada no Baileys em background
6. Frontend inicia polling para QR Code
7. QR Code aparece em 3-5 segundos
```

## Resultado Esperado

- Botão responde rapidamente (< 1 segundo)
- Modal não mostra conexões inexistentes
- QR Code aparece via polling
- Sem erros de timeout
