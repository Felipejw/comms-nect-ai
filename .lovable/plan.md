

# Plano: Corrigir Edge Functions no VPS (Edge Runtime 502)

## Problema Identificado

O Edge Runtime retorna **502 Bad Gateway** para todas as requisicoes. Os logs do container estao vazios, indicando crash silencioso ou conflito interno.

### Causa Raiz

O arquivo `main/index.ts` (router principal) usa `await import()` para carregar sub-funcoes dinamicamente. Cada sub-funcao (ex: `admin-write/index.ts`) tem `Deno.serve(handler)` no final do arquivo. Quando essa linha executa durante o `import()`, ela **substitui** o handler do router principal, quebrando todo o roteamento.

```text
Fluxo do problema:

1. Edge Runtime inicia main/index.ts
2. main chama Deno.serve(routerHandler) -- OK, router registrado
3. Requisicao chega para /admin-write
4. main faz: await import('../admin-write/index.ts')
5. admin-write/index.ts executa Deno.serve(adminHandler) -- CONFLITO!
6. O handler do router e SUBSTITUIDO pelo handler do admin-write
7. Todas as proximas requisicoes vao direto para admin-write
8. Nenhuma outra funcao funciona mais
```

Alem disso, `setup-tenant` esta no mapeamento do router mas o diretorio **nao existe** no repositorio.

## Solucao

### 1. Corrigir `main/index.ts` - Neutralizar `Deno.serve` durante imports

Modificar a funcao `loadFunction` para temporariamente desabilitar `Deno.serve` antes de importar sub-funcoes, evitando que elas substituam o handler principal:

```typescript
async function loadFunction(name: string) {
  if (moduleCache.has(name)) {
    return moduleCache.get(name)!;
  }

  const modulePath = FUNCTION_HANDLERS[name];
  if (!modulePath) return null;

  try {
    // Salvar Deno.serve original e substituir por no-op
    const originalServe = Deno.serve;
    (Deno as any).serve = () => {};

    const module = await import(modulePath);

    // Restaurar Deno.serve original
    (Deno as any).serve = originalServe;

    if (typeof module.default === 'function') {
      moduleCache.set(name, module.default);
      return module.default;
    }
    return null;
  } catch (error) {
    console.error(`[main-router] Error loading function '${name}':`, error);
    return null;
  }
}
```

Tambem remover `setup-tenant` do mapeamento (diretorio inexistente) e adicionar logging de boot.

### 2. Adicionar guarda `import.meta.main` em TODAS as sub-funcoes

Em cada uma das 24 sub-funcoes, substituir:

```typescript
// ANTES (quebra quando importado pelo router):
Deno.serve(handler);

// DEPOIS (funciona tanto standalone quanto importado):
if (import.meta.main) {
  Deno.serve(handler);
}
```

Funcoes afetadas:
- admin-write
- baileys-create-session
- baileys-instance
- baileys-webhook
- check-connections
- create-user
- delete-user
- download-whatsapp-media
- execute-campaign
- execute-flow
- fetch-whatsapp-profile
- google-auth
- google-calendar
- merge-duplicate-contacts
- meta-api-webhook
- process-schedules
- reset-user-password
- resolve-lid-contact
- save-system-setting
- send-meta-message
- send-whatsapp
- sync-contacts
- update-lid-contacts
- update-user-email

### 3. Atualizar `deploy/supabase/init.sql`

Copiar as mesmas correcoes para o init.sql do pacote de deploy, garantindo que novas instalacoes VPS ja tenham as funcoes corretas.

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/main/index.ts` | Neutralizar Deno.serve durante imports, remover setup-tenant, adicionar logging |
| 24 sub-funcoes em `supabase/functions/*/index.ts` | Adicionar guarda `import.meta.main` no `Deno.serve` |

## Apos Aprovacao

Depois de implementar, no VPS execute:

```bash
cd /opt/sistema
git pull origin main
cd deploy
sudo docker compose restart functions
sleep 5
sudo docker logs supabase-functions --tail 30
```

Isso deve mostrar o log `[main-router] Ready` e as funcoes passarao a responder corretamente.

