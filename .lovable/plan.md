
# Plano: Corrigir Criação de Conexão WhatsApp (Travando no Loading)

## Diagnóstico Definitivo

### O Que Está Acontecendo

1. **Chamada `create`** é feita à edge function
2. A edge function cria a sessão no servidor Baileys com sucesso
3. A edge function **aguarda 3 segundos** (`setTimeout(3000)`)
4. A edge function tenta buscar o QR Code do servidor
5. **A edge function atinge TIMEOUT ou a chamada é cancelada**
6. O frontend nunca recebe resposta → botão fica em loading infinito

### Evidências
- Logs mostram "Action: create" mas nunca mostram "Waiting to fetch QR"
- Teste direto da API retornou: `context canceled`
- O problema foi introduzido quando adicionamos o `setTimeout(3000)` para buscar QR proativamente

### Causa Raiz
Edge functions do Supabase têm timeout de ~10 segundos. O delay de 3 segundos + chamadas HTTP ao servidor Baileys pode estar excedendo esse limite ou causando problemas de conexão.

## Solução

**Abordagem: Retorno Imediato + Polling no Frontend**

Em vez de esperar na edge function, vamos:
1. Criar a sessão e retornar imediatamente
2. Deixar o frontend fazer polling para buscar o QR Code
3. Manter a lógica de buscar QR Code na action `getQrCode` que já existe

### Alteração 1: Remover setTimeout e busca de QR na action "create"

**Arquivo:** `supabase/functions/baileys-instance/index.ts`

Remover linhas 129-154 (o bloco que aguarda 3 segundos e busca QR). A função deve retornar imediatamente após criar a conexão no banco.

```typescript
// ANTES (com problema):
// Aguardar e buscar QR Code imediatamente
await new Promise(resolve => setTimeout(resolve, 3000));
const qrResponse = await fetch(...);
// ...

// DEPOIS (corrigido):
// Retornar imediatamente, QR será buscado via polling
return new Response(
  JSON.stringify({ success: true, data: connection }),
  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

### Alteração 2: Remover setTimeout e busca de QR na action "recreate"

**Arquivo:** `supabase/functions/baileys-instance/index.ts`

Remover linhas 406-433 (mesmo problema na action `recreate`).

### Alteração 3: Garantir que polling seja iniciado no frontend

**Arquivo:** `src/pages/Conexoes.tsx`

Garantir que após criar/reconectar, o polling seja sempre iniciado:

```typescript
// handleCreateConnection
if (result.data) {
  setSelectedConnection(result.data);
  setIsQrModalOpen(true);
  setPollingConnection(result.data.id); // Sempre iniciar polling
}

// handleRefreshQrCode  
await recreateConnection.mutateAsync(connection.id);
setPollingConnection(connection.id); // Sempre iniciar polling
```

### Alteração 4: Melhorar a action getQrCode para atualizar banco

**Arquivo:** `supabase/functions/baileys-instance/index.ts`

Verificar se a action `getQrCode` está salvando corretamente o QR no banco quando busca com sucesso.

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/baileys-instance/index.ts` | Remover setTimeout e busca de QR das actions `create` e `recreate` |
| `src/pages/Conexoes.tsx` | Simplificar lógica para sempre iniciar polling após criar/reconectar |

## Por Que Esta Solução Funciona

1. **Edge function retorna rápido** (< 2 segundos)
2. **Frontend inicia polling** imediatamente
3. **Polling chama getQrCode** a cada 3 segundos
4. **getQrCode busca QR do servidor Baileys** e salva no banco
5. **Próximo refetch** pega QR do banco e exibe

## Fluxo Corrigido

```text
1. Usuário clica "Criar Instância"
2. Edge function cria sessão no Baileys (sem esperar QR)
3. Edge function cria registro no banco com status "connecting"
4. Edge function retorna imediatamente
5. Frontend abre modal de QR e inicia polling
6. Polling chama getQrCode a cada 3s
7. getQrCode busca QR do servidor e salva no banco
8. Frontend exibe QR Code
```

## Resultado Esperado

- Botão "Criar Instância" responde em ~1-2 segundos
- Modal de QR abre imediatamente
- QR Code aparece em 3-6 segundos via polling
- Nenhum timeout ou travamento
