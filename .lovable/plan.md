

# Correção: Reimplantar baileys-instance e Tornar Disconnect Resiliente

## Causa Raiz

A função `baileys-instance` não está implantada no servidor (retorna 404 em todas as chamadas). Isso fez o servidor aparecer como "Offline" e impediu a desconexão pelo sistema. Além disso, as ações `disconnect` e `delete` não possuem tratamento de erro para quando o servidor Baileys está inacessível.

## Correções Necessárias

### 1. Reimplantar a função `baileys-instance`

Forçar o deploy da função para que ela volte a responder. Não há alteração de código necessária para isso -- basta garantir que o deploy ocorra corretamente.

### 2. Adicionar try-catch no `disconnect` (linhas 354-359)

**Arquivo**: `supabase/functions/baileys-instance/index.ts`

Atualmente, se o servidor Baileys estiver fora do ar, a chamada DELETE falha e a função inteira crasheia sem atualizar o banco de dados. A correção:

```text
// ANTES (sem proteção):
if (sessionName) {
  await fetch(`${baileysUrl}/sessions/${sessionName}`, {
    method: "DELETE",
    headers,
  });
}

// DEPOIS (com proteção):
if (sessionName) {
  try {
    await fetch(`${baileysUrl}/sessions/${sessionName}`, {
      method: "DELETE",
      headers,
    });
  } catch (fetchError) {
    console.error(`[Baileys Instance] Disconnect: server unreachable, proceeding with DB update`);
    // Continuar mesmo se o servidor estiver offline
    // O importante é atualizar o banco de dados
  }
}
```

Isso garante que, mesmo que o servidor Baileys esteja indisponível, o status da conexão no banco será atualizado para "disconnected" e o usuário verá a mudança na interface.

### 3. Adicionar try-catch no `delete` (linhas 391-396)

**Arquivo**: `supabase/functions/baileys-instance/index.ts`

Mesma correção para a ação de excluir conexão:

```text
// ANTES:
if (sessionName) {
  await fetch(`${baileysUrl}/sessions/${sessionName}`, {
    method: "DELETE",
    headers,
  });
}

// DEPOIS:
if (sessionName) {
  try {
    await fetch(`${baileysUrl}/sessions/${sessionName}`, {
      method: "DELETE",
      headers,
    });
  } catch (fetchError) {
    console.error(`[Baileys Instance] Delete: server unreachable, proceeding with DB cleanup`);
  }
}
```

### 4. Adicionar try-catch no `recreate` (linhas 428-433)

**Arquivo**: `supabase/functions/baileys-instance/index.ts`

A ação de reconectar também deleta a sessão antiga sem proteção:

```text
// ANTES:
if (oldSessionName) {
  await fetch(`${baileysUrl}/sessions/${oldSessionName}`, {
    method: "DELETE",
    headers,
  });
}

// DEPOIS:
if (oldSessionName) {
  try {
    await fetch(`${baileysUrl}/sessions/${oldSessionName}`, {
      method: "DELETE",
      headers,
    });
  } catch (fetchError) {
    console.error(`[Baileys Instance] Recreate: could not delete old session, proceeding anyway`);
  }
}
```

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/baileys-instance/index.ts` | Adicionar try-catch nas ações disconnect, delete e recreate para proteger contra servidor Baileys inacessível |
| Deploy | Forçar reimplantação da função `baileys-instance` |

## Resultado Esperado

Após a correção:
- O servidor voltará a aparecer como "Online" na tela de Conexões
- Desconectar pelo sistema sempre funcionará (mesmo com o servidor Baileys offline, o banco será atualizado)
- Excluir e reconectar conexões também funcionarão de forma resiliente
