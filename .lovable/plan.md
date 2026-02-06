
# Correcoes na Pagina de Atendentes (Usuarios)

## Diagnostico Completo

### Problema 1 e 4 - Erros ao criar e excluir usuarios
**Causa**: As funcoes `create-user` e `delete-user` nao estao implantadas no servidor (retornam 404). Alem disso, os headers CORS estao incompletos -- faltam headers que o cliente Supabase JS envia automaticamente.

**Solucao**:
- Atualizar os headers CORS em ambas as funcoes para incluir todos os headers necessarios
- Reimplantar ambas as funcoes

### Problema 2 - Mudanca de nivel nao funciona visualmente
**Causa**: O hook `useUpdateUserRole` tenta gravar o valor `'atendente'` no banco de dados, porem o enum do banco aceita apenas `super_admin`, `admin`, `manager` e `operator`. O valor `'atendente'` e rejeitado silenciosamente, e o badge na interface nao muda.

**Solucao**: Corrigir o mapeamento no hook para converter `'atendente'` para `'operator'` antes de gravar.

### Problema 3 - Status sempre aparece Offline
**Causa**: Nenhum codigo no sistema atualiza o campo `is_online` no banco de dados. Todos os usuarios tem `is_online = false` permanentemente.

**Solucao**: Adicionar um hook de presenca que atualiza `is_online = true` e `last_seen = now()` quando o usuario esta logado, e marca como offline ao sair.

---

## Detalhes Tecnicos

### 1. Atualizar CORS do `create-user`
**Arquivo**: `supabase/functions/create-user/index.ts` (linhas 4-7)

Substituir os corsHeaders por:
```text
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
```

### 2. Atualizar CORS do `delete-user`
**Arquivo**: `supabase/functions/delete-user/index.ts` (linhas 3-6)

Substituir os corsHeaders por:
```text
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
```

### 3. Reimplantar as funcoes
Forcar deploy de `create-user` e `delete-user` para que voltem a responder.

### 4. Corrigir mapeamento de role
**Arquivo**: `src/hooks/useUsers.ts` (linhas 109-136)

Alterar a mutacao `useUpdateUserRole` para mapear corretamente:
- `'admin'` -> `'admin'` (sem mudanca)
- `'atendente'` -> `'operator'` (valor valido no enum do banco)

```text
mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'atendente' }) => {
  const dbRole = role === 'admin' ? 'admin' : 'operator';
  const { error } = await supabase
    .from('user_roles')
    .update({ role: dbRole as any })
    .eq('user_id', userId);
  if (error) throw error;
},
```

### 5. Adicionar rastreamento de presenca online
**Novo arquivo**: `src/hooks/usePresence.ts`

Criar um hook que:
- Ao montar (usuario logado), atualiza `is_online = true` e `last_seen = now()` no perfil
- A cada 60 segundos, atualiza `last_seen = now()` (heartbeat)
- Ao desmontar ou ao fazer logout, atualiza `is_online = false`
- Usa `window.addEventListener('beforeunload')` para marcar offline ao fechar a aba

### 6. Integrar presenca no layout
**Arquivo**: `src/components/layout/AppLayout.tsx`

Chamar o hook `usePresence()` dentro do AppLayout para que ele funcione em todas as paginas autenticadas.

---

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/create-user/index.ts` | Atualizar headers CORS |
| `supabase/functions/delete-user/index.ts` | Atualizar headers CORS |
| `src/hooks/useUsers.ts` | Corrigir mapeamento 'atendente' -> 'operator' no useUpdateUserRole |
| `src/hooks/usePresence.ts` | Novo hook para rastreamento de presenca online |
| `src/components/layout/AppLayout.tsx` | Integrar hook de presenca |
| Deploy | Reimplantar create-user e delete-user |
