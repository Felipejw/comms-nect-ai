
# Correção: Edge Functions Self-Hosted e Erro ao Salvar Configurações

## Análise dos Dois Erros

### Erro 1: "Erro ao salvar configurações"
O salvamento usa a REST API (/rest/v1/system_settings). O Nginx foi corrigido e o curl confirmou que a rota responde (401 sem auth). O erro pode ter três causas:
- A sessão de autenticação expirou (JWT expirado) -- possível se o login foi feito há muito tempo
- O role do usuário admin no banco self-hosted não é admin/manager/super_admin (a RLS exige `is_admin_or_manager`)
- Alguma particularidade do POST/PATCH no Nginx

**Diagnóstico recomendado (rodar no VPS):**
```bash
# Verificar role do admin
sudo docker exec supabase-db psql -U postgres -c "
  SELECT ur.role, p.email 
  FROM public.user_roles ur 
  JOIN public.profiles p ON p.user_id = ur.user_id 
  WHERE p.email = 'admin@admin.com';
"
```
Se o resultado NÃO mostrar `super_admin` ou `admin`, é preciso corrigir o role.

### Erro 2: "Edge Function returned a non-2xx status code"
**Este é o erro principal e tem causa raiz clara no código.**

O roteador de Edge Functions self-hosted (`supabase/functions/main/index.ts`) usa importação dinâmica para carregar sub-funções:

```text
main/index.ts importa ../baileys-instance/index.ts
             → módulo chama Deno.serve() ou serve() ao ser importado
             → conflito com o servidor já ativo do main
             → module.default é undefined (nada é exportado)
             → loadFunction retorna null → HTTP 500
```

O problema é que NENHUMA das 23 edge functions exporta um handler -- todas chamam `Deno.serve()` ou `serve()` no nível raiz do módulo, sem exportar nada.

## Solução

Modificar todas as 23 edge functions para:
1. Extrair a lógica do handler para uma constante nomeada
2. Exportar essa constante como `default`
3. Chamar `Deno.serve(handler)` condicionalmente (apenas quando rodando standalone)

### Padrão da mudança (mesmo para todas as funções)

**Antes (funções que usam `Deno.serve`):**
```typescript
Deno.serve(async (req) => {
  // ... toda a lógica ...
});
```

**Antes (funções que usam `serve` do std):**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
serve(async (req) => {
  // ... toda a lógica ...
});
```

**Depois (padrão unificado para TODAS):**
```typescript
const handler = async (req: Request): Promise<Response> => {
  // ... mesma lógica, sem alterações ...
};

export default handler;
Deno.serve(handler);
```

### Por que funciona

- **Lovable Cloud**: `Deno.serve(handler)` é executado normalmente, servindo a função como hoje
- **Self-hosted**: Quando `main/index.ts` faz `import('../baileys-instance/index.ts')`, o `Deno.serve()` é executado (o edge runtime intercepta sem conflito), e `module.default` retorna o handler, que o roteador pode chamar

### Atualização do main router

O roteador principal (`main/index.ts`) também precisa ser atualizado:
- Remover import do `serve` do std library
- Usar `Deno.serve()` para consistência
- Exportar o handler como default

## Arquivos a serem alterados (23 edge functions + 1 router)

| # | Arquivo | Padrão atual |
|---|---------|-------------|
| 1 | `supabase/functions/main/index.ts` | serve() do std |
| 2 | `supabase/functions/baileys-create-session/index.ts` | Deno.serve() |
| 3 | `supabase/functions/baileys-instance/index.ts` | Deno.serve() |
| 4 | `supabase/functions/baileys-webhook/index.ts` | Deno.serve() |
| 5 | `supabase/functions/check-connections/index.ts` | verificar |
| 6 | `supabase/functions/create-user/index.ts` | serve() do std |
| 7 | `supabase/functions/delete-user/index.ts` | verificar |
| 8 | `supabase/functions/download-whatsapp-media/index.ts` | verificar |
| 9 | `supabase/functions/execute-campaign/index.ts` | verificar |
| 10 | `supabase/functions/execute-flow/index.ts` | verificar |
| 11 | `supabase/functions/fetch-whatsapp-profile/index.ts` | verificar |
| 12 | `supabase/functions/google-auth/index.ts` | verificar |
| 13 | `supabase/functions/google-calendar/index.ts` | verificar |
| 14 | `supabase/functions/merge-duplicate-contacts/index.ts` | verificar |
| 15 | `supabase/functions/meta-api-webhook/index.ts` | verificar |
| 16 | `supabase/functions/process-schedules/index.ts` | verificar |
| 17 | `supabase/functions/reset-user-password/index.ts` | verificar |
| 18 | `supabase/functions/resolve-lid-contact/index.ts` | verificar |
| 19 | `supabase/functions/send-meta-message/index.ts` | verificar |
| 20 | `supabase/functions/send-whatsapp/index.ts` | verificar |
| 21 | `supabase/functions/setup-tenant/index.ts` | serve() do std |
| 22 | `supabase/functions/sync-contacts/index.ts` | verificar |
| 23 | `supabase/functions/update-lid-contacts/index.ts` | verificar |
| 24 | `supabase/functions/update-user-email/index.ts` | verificar |

## Melhoria no tratamento de erro do save

Além disso, o componente `BaileysConfigSection` será atualizado para exibir o erro real no toast em vez de uma mensagem genérica, facilitando diagnóstico futuro:

```typescript
// De:
toast.error("Erro ao salvar configurações");

// Para:
toast.error(`Erro ao salvar: ${error.message || 'desconhecido'}`);
```

## Passos de diagnóstico para o erro de salvar

Após implementar as mudanças, se o erro de save persistir, rodar no VPS:

```bash
# 1. Verificar role do admin
sudo docker exec supabase-db psql -U postgres -c \
  "SELECT ur.role FROM public.user_roles ur JOIN public.profiles p ON p.user_id = ur.user_id WHERE p.email = 'admin@admin.com';"

# 2. Se não for super_admin, corrigir:
sudo docker exec supabase-db psql -U postgres -c "
  UPDATE public.user_roles SET role = 'super_admin' 
  WHERE user_id = (SELECT user_id FROM public.profiles WHERE email = 'admin@admin.com');
"

# 3. Testar REST API com auth (substituir ANON_KEY pelo valor real)
curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: SEU_ANON_KEY" \
  -H "Authorization: Bearer SEU_ANON_KEY" \
  "http://localhost/rest/v1/system_settings?select=key&limit=1"
```

## Após implementação

```bash
cd /opt/sistema && git pull origin main
cd deploy
sudo docker compose up -d --force-recreate functions
sudo docker compose restart nginx
```
