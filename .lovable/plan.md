

# Plano: Corrigir Criação de Sessão no Servidor Baileys

## Diagnóstico Definitivo

### O Que Está Acontecendo

O problema está claro agora:

| Dado | Valor |
|------|-------|
| Servidor Baileys | Online (status: ok) |
| Sessões no servidor | **0** (nenhuma sessão criada) |
| Log "Baileys session creation result" | **Não existe** |
| Conexão no banco | Existe com status "connecting" |

### Causa Raiz

O código "fire-and-forget" que cria a sessão no servidor Baileys em background **não está executando**:

```typescript
// Este código NÃO está executando ou está falhando silenciosamente
if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
  EdgeRuntime.waitUntil(createBaileysSession());
} else {
  createBaileysSession(); // Esta chamada sem await é descartada
}
```

**Problema:** Em Deno/Supabase Edge Functions, quando você faz uma chamada assíncrona sem `await` após um `return`, essa chamada pode ser cancelada quando a função termina.

## Solução

**Abordagem: Criar sessão ANTES de retornar, com timeout curto**

Em vez de tentar executar em background (que não funciona de forma confiável), vamos:

1. Fazer a chamada ao servidor Baileys com um timeout de 8 segundos
2. Se tiver sucesso ou timeout, retornar ao frontend
3. O frontend continua com polling normalmente

### Alteração Principal

**Arquivo:** `supabase/functions/baileys-instance/index.ts`

Para as actions `create` e `recreate`:

```typescript
// Criar sessão no servidor Baileys COM timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 8000);

try {
  console.log(`[Baileys Instance] Creating session on server...`);
  const response = await fetch(`${baileysUrl}/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, webhookUrl }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  
  const result = await response.json();
  console.log(`[Baileys Instance] Session creation result:`, result.success ? "success" : result.error);
  
  if (!result.success) {
    await supabaseClient
      .from("connections")
      .update({ status: "error" })
      .eq("id", connection.id);
  }
} catch (err) {
  clearTimeout(timeoutId);
  console.error(`[Baileys Instance] Session creation failed:`, err);
  // Não atualizar para erro imediatamente - deixar o polling tentar novamente
}

// Retornar
return new Response(
  JSON.stringify({ success: true, data: connection }),
  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/baileys-instance/index.ts` | Remover fire-and-forget, usar await com timeout |

## Por Que Esta Solução Funciona

1. **Chamada síncrona com timeout**: Garante que a sessão seja criada antes de retornar
2. **Timeout de 8 segundos**: Dentro do limite de 10s das edge functions
3. **Tratamento de erro gracioso**: Se timeout, não bloqueia - polling continua tentando
4. **Log completo**: Sempre saberemos se a sessão foi criada ou não

## Fluxo Corrigido

```text
1. Usuário clica "Criar Instância"
2. Edge function cria registro no banco (< 1s)
3. Edge function chama POST /sessions no Baileys (aguarda até 8s)
4. Se sucesso: sessão criada, QR gerado pelo servidor
5. Edge function retorna ao frontend
6. Frontend abre modal e inicia polling
7. Polling busca QR que agora existe no servidor
8. QR Code aparece em 3-5 segundos
```

## Resultado Esperado

- Botão "Criar Instância" pode demorar até 8 segundos (ainda aceitável)
- Sessão é efetivamente criada no servidor Baileys
- QR Code aparece via polling
- Logs completos para debug

## Alternativa: Verificar se EdgeRuntime.waitUntil funciona

Se preferirmos manter a abordagem assíncrona, podemos adicionar logs para verificar:

```typescript
console.log(`[Baileys Instance] EdgeRuntime exists: ${typeof EdgeRuntime !== 'undefined'}`);
console.log(`[Baileys Instance] waitUntil exists: ${typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function'}`);
```

Mas a solução mais confiável é a síncrona com timeout.

