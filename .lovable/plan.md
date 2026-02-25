

# Criar Usuário Admin no Ambiente Lovable

## Situação

O ambiente de preview do Lovable tem um banco de dados separado da VPS de produção. Os usuários existentes no preview são:
- `unlockedbahia@gmail.com` (super_admin)
- `malik@gmail.com` (operator)

O usuário `admin@admin.com` não existe neste ambiente, por isso o login falha com "Invalid login credentials".

## Solução

Criar uma edge function temporária `bootstrap-admin` que usa o service role key (sem exigir autenticação) para criar ou atualizar o usuário `admin@admin.com` com senha `123456` e role `super_admin`.

### Arquivo: `supabase/functions/bootstrap-admin/index.ts`

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const email = "admin@admin.com";
  const password = "123456";

  // Check if user exists
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(u => u.email === email);

  if (existing) {
    await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: existing.id, role: "super_admin" },
      { onConflict: "user_id" }
    );
    return new Response(JSON.stringify({ success: true, message: "Password updated" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: "Admin" },
  });

  if (error) throw error;

  await supabaseAdmin.from("user_roles").upsert(
    { user_id: newUser.user.id, role: "super_admin" },
    { onConflict: "user_id" }
  );

  return new Response(JSON.stringify({ success: true, message: "Admin created" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

export default handler;
if (import.meta.main) Deno.serve(handler);
```

### Registro no config.toml

Adicionar:
```toml
[functions.bootstrap-admin]
verify_jwt = false
```

## Passos

1. Criar a edge function `bootstrap-admin`
2. Registrar no `config.toml` com `verify_jwt = false`
3. Fazer deploy e chamar a função uma vez para criar o usuário
4. Após confirmar o login, a função pode ser removida

## Resultado

Você poderá logar no preview com `admin@admin.com` / `123456`.

