
# Plano: Melhorar Diagnóstico e Conectividade da Edge Function Baileys

## Problema Identificado

A edge function `baileys-instance` está retornando "Server unreachable" quando tenta conectar ao servidor Baileys na VPS. No entanto, testes externos confirmam que o servidor está acessível em `https://chatbotvital.store/baileys/health`.

### Causa Raiz
O bloco `catch` na edge function (linhas 401-405) captura **qualquer erro** e retorna uma mensagem genérica "Server unreachable", sem mostrar detalhes do erro real. Isso pode ser:
- Timeout de conexão
- Erro de SSL/TLS
- Resposta não-JSON causando erro no `.json()`
- Outros erros de rede

## Solucao Proposta

### 1. Melhorar Logging e Tratamento de Erros na Edge Function

Modificar o case `serverHealth` em `supabase/functions/baileys-instance/index.ts`:

```typescript
case "serverHealth": {
  const healthUrl = `${baileysUrl}/health`;
  console.log(`[Baileys Health] Checking: ${healthUrl}`);
  
  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers,
    });

    console.log(`[Baileys Health] Response status: ${response.status}`);
    
    // Verificar se a resposta foi bem sucedida
    if (!response.ok) {
      const text = await response.text();
      console.log(`[Baileys Health] Error response: ${text}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Server returned ${response.status}: ${text}` 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = await response.text();
    console.log(`[Baileys Health] Response body: ${text}`);
    
    // Tentar parsear como JSON
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // Se não for JSON, criar objeto com a resposta
      result = { status: "ok", raw: text };
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Baileys Health] Network error: ${errorMessage}`);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Connection failed: ${errorMessage}` 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
```

### 2. Adicionar Timeout Explícito

Edge functions podem ter timeout padrão muito curto. Adicionar AbortController:

```typescript
case "serverHealth": {
  const healthUrl = `${baileysUrl}/health`;
  console.log(`[Baileys Health] Checking: ${healthUrl}`);
  
  // Timeout de 10 segundos
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // ... resto do código
  } catch (error) {
    clearTimeout(timeoutId);
    // ... tratamento de erro
  }
}
```

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/baileys-instance/index.ts` | Melhorar tratamento de erros e logging no case serverHealth |

## Benefícios

1. **Diagnóstico preciso** - Ver o erro real nos logs da edge function
2. **Timeout controlado** - Evitar que a requisição fique pendurada
3. **Tratamento de resposta não-JSON** - O endpoint `/health` do Nginx retorna texto plano
4. **Mensagens de erro claras** - Usuário sabe exatamente o que falhou

## Próximos Passos Após Implementação

1. Deploy da edge function atualizada
2. Testar novamente a conexão
3. Verificar os logs da edge function para ver o erro real
4. Corrigir com base no diagnóstico obtido
