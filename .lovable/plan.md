

# Corrigir Bug "Acesso Negado" ao Logar

## Causa Raiz

O problema **não é um bug de timing/race condition**. O usuário `admin@admin.com` está com role `operator` no banco (deveria ser `super_admin`). Isso aconteceu porque a função `bootstrap-admin` usa `upsert` com `onConflict: "user_id"`, mas a constraint UNIQUE da tabela `user_roles` é no par `(user_id, role)`, não apenas em `user_id`. Por isso o upsert falhou silenciosamente e a role `operator` nunca foi atualizada para `super_admin`.

Com role `operator` e nenhuma permissão configurada, `hasPermission('dashboard', 'view')` retorna `false` → redireciona para `/acesso-negado`.

## Plano

### 1. Corrigir a role no banco via migração
Executar SQL para atualizar a role do admin para `super_admin`:
```sql
UPDATE user_roles SET role = 'super_admin' WHERE user_id = '33c631a4-a9c5-4623-85c2-eb7d604298df';
```

### 2. Corrigir a função bootstrap-admin
Alterar de `upsert` para `DELETE` + `INSERT` para funcionar corretamente com a constraint `UNIQUE(user_id, role)`:
```typescript
// Antes (não funciona com unique(user_id, role)):
await supabaseAdmin.from("user_roles").upsert({ user_id, role: "super_admin" }, { onConflict: "user_id" });

// Depois:
await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "super_admin" });
```

### Arquivos alterados
- Migração SQL para corrigir a role atual
- `supabase/functions/bootstrap-admin/index.ts` -- corrigir lógica de upsert

