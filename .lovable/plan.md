

# Plano: Corrigir Timeout na Criação de Sessão Baileys

## Diagnóstico Definitivo

### O Que Está Acontecendo

| Etapa | Status | Evidência |
|-------|--------|-----------|
| Health check do servidor | OK | `sessions: 0, status: ok` |
| Edge function recebe request | OK | Logs mostram "Action: recreate" |
| Atualização do banco | OK | sessionName atualizado para `gatteflow_1770173520494` |
| Chamada POST /sessions | **TIMEOUT** | `AbortError: The signal has been aborted` após 8s |
| Sessão criada no servidor | **NÃO** | Servidor ainda mostra `sessions: 0` |
| QR Code gerado | **NÃO** | Polling retorna "QR Code not available" |

### Logs Relevantes

```text
02:52:00Z [Baileys Instance] Recreating session on server: https://chatbotvital.store/baileys/sessions
02:52:08Z [Baileys Instance] Recreate session timeout: AbortError: The signal has been aborted
02:52:08Z [Baileys Instance] Recreate complete, returning to frontend
```

A chamada ao servidor Baileys demorou **8 segundos** e foi abortada pelo timeout.

### Causa Raiz

O servidor Baileys demora **mais de 8 segundos** para criar uma nova sessão. Possíveis razões:
- O servidor precisa estabelecer conexão com WhatsApp Web (pode demorar 10-30 segundos)
- O servidor está em cold start
- O VPS está com recursos limitados

## Solução

### Opção A: Aumentar Timeout (Limitado)

Edge Functions do Supabase têm limite de ~10 segundos. Não podemos aumentar muito além de 8s.

### Opção B: Modelo Assíncrono com Retry (Recomendado)

Em vez de esperar a resposta do servidor Baileys:

1. **Iniciar criação sem esperar** (fire-and-forget com retry)
2. **Atualizar status via webhook** (o webhook já existe e atualiza o status)
3. **Polling mais inteligente** no frontend

### Alterações Propostas

#### 1. Iniciar sessão sem await, com retry via background

**Arquivo:** `supabase/functions/baileys-instance/index.ts`

Para `create` e `recreate`:

```typescript
// Em vez de await com timeout de 8s, fazer chamada sem esperar
// A resposta virá via webhook quando o QR for gerado

console.log(`[Baileys Instance] Initiating session creation (async)`);

// Fazer 3 tentativas em background sem bloquear
const initiateSessionCreation = async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[Baileys Instance] Session creation attempt ${attempt}/3`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout para background
      
      const response = await fetch(`${baileysUrl}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: sessionName, webhookUrl }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      const result = await response.json();
      console.log(`[Baileys Instance] Attempt ${attempt} result:`, result.success ? "success" : result.error);
      
      if (result.success) {
        return; // Sucesso, parar retries
      }
    } catch (err) {
      console.error(`[Baileys Instance] Attempt ${attempt} failed:`, err);
    }
    
    // Aguardar 2s antes de próxima tentativa
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  // Todas as tentativas falharam
  await supabaseClient
    .from("connections")
    .update({ status: "error" })
    .eq("id", connectionId);
};

// Executar em background (não bloqueia retorno)
initiateSessionCreation();

// Retornar imediatamente
return new Response(
  JSON.stringify({ success: true, data: connection }),
  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

**Problema:** Edge functions terminam quando retornam. Background tasks são canceladas.

### Opção C: Chamar Servidor Baileys via Cron ou Segunda Função

Criar uma função separada para iniciar sessões que pode ser chamada de forma assíncrona.

### Opção D: Webhook-first (Mais Simples e Confiável)

O servidor Baileys já tem webhook configurado. Quando a sessão é criada e o QR é gerado, o servidor envia:
- `event: qr.update` com o QR Code
- `event: session.status` com o status

**Fluxo proposto:**

1. Edge function faz chamada ao Baileys **sem esperar resposta**
2. Edge function retorna imediatamente ao frontend
3. Servidor Baileys cria sessão (pode demorar 10-30s)
4. Servidor Baileys envia webhook com QR Code
5. Webhook `baileys-webhook` salva QR no banco
6. Frontend polling detecta QR e exibe

**Implementação:**

```typescript
// Chamada fire-and-forget (sem await)
console.log(`[Baileys Instance] Initiating session creation (fire-and-forget)`);

// Usar fetch sem await
fetch(`${baileysUrl}/sessions`, {
  method: "POST",
  headers,
  body: JSON.stringify({ name: sessionName, webhookUrl }),
}).then(response => response.json())
  .then(result => console.log(`[Baileys Background] Result:`, result))
  .catch(err => console.error(`[Baileys Background] Error:`, err));

// Retornar imediatamente
return new Response(
  JSON.stringify({ success: true, data: connection }),
  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

**Limitação:** A Promise é cancelada quando a edge function termina.

### Opção E: Delegar para Edge Function de Longa Duração (Melhor Solução)

Criar uma edge function separada com `verify_jwt = false` que:
1. É chamada sem autenticação (internamente)
2. Pode rodar até 60 segundos
3. Faz o POST ao servidor Baileys com timeout maior

**Arquivos:**

1. `supabase/functions/baileys-create-session/index.ts` - Nova função
2. `supabase/config.toml` - Adicionar configuração

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/baileys-create-session/index.ts` | **NOVA** função para criação de sessão |
| `supabase/config.toml` | Adicionar nova função |
| `supabase/functions/baileys-instance/index.ts` | Delegar criação para nova função |

## Nova Função: baileys-create-session

```typescript
// supabase/functions/baileys-create-session/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { connectionId, sessionName, webhookUrl, baileysUrl, baileysApiKey } = await req.json();
  
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (baileysApiKey) headers["X-API-Key"] = baileysApiKey;
  
  console.log(`[Baileys Session] Creating session: ${sessionName}`);
  
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 55000); // 55s timeout
    
    const response = await fetch(`${baileysUrl}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: sessionName, webhookUrl }),
      signal: controller.signal,
    });
    
    const result = await response.json();
    console.log(`[Baileys Session] Result:`, result.success ? "success" : result.error);
    
    if (!result.success) {
      await supabaseClient
        .from("connections")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", connectionId);
    }
    
    return new Response(JSON.stringify(result));
  } catch (err) {
    console.error(`[Baileys Session] Failed:`, err);
    await supabaseClient
      .from("connections")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", connectionId);
    return new Response(JSON.stringify({ success: false, error: String(err) }));
  }
});
```

## Modificação em baileys-instance

Na action `create` e `recreate`:

```typescript
// Delegar criação para função de longa duração
console.log(`[Baileys Instance] Delegating session creation to baileys-create-session`);

fetch(`${supabaseUrl}/functions/v1/baileys-create-session`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
  },
  body: JSON.stringify({
    connectionId: connection.id,
    sessionName: name,
    webhookUrl,
    baileysUrl,
    baileysApiKey,
  }),
}); // Não esperar resposta

// Retornar imediatamente
return new Response(
  JSON.stringify({ success: true, data: connection }),
  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

## Fluxo Corrigido

```text
1. Usuário clica "Criar Instância"
2. baileys-instance cria registro no banco
3. baileys-instance chama baileys-create-session (sem esperar)
4. baileys-instance retorna imediatamente ao frontend
5. Frontend abre modal de QR e inicia polling
6. baileys-create-session faz POST ao servidor Baileys (até 55s)
7. Servidor Baileys cria sessão e envia webhook com QR
8. baileys-webhook salva QR no banco
9. Frontend polling detecta QR e exibe
```

## Resultado Esperado

- Botão responde em < 2 segundos
- Sessão é criada em background (até 55 segundos)
- QR Code aparece via webhook (quando servidor Baileys responde)
- Polling serve como backup para buscar QR

