// ===========================================
// Create User - Cria usuario com role e permissoes
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Autenticar o chamador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[create-user] Missing Authorization header");
      return new Response(
        JSON.stringify({ error: "Não autorizado: token ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerError } = await supabaseUser.auth.getUser(token);
    if (callerError || !callerData?.user) {
      console.error("[create-user] Auth error:", callerError?.message);
      return new Response(
        JSON.stringify({ error: "Não autorizado: token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerId = callerData.user.id;
    console.log(`[create-user] Caller: ${callerId}`);

    // 2. Verificar se o chamador é admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: callerRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    if (rolesError) {
      console.error("[create-user] Error fetching caller roles:", rolesError.message);
      return new Response(
        JSON.stringify({ error: "Erro ao verificar permissões" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roles = (callerRoles || []).map((r: any) => r.role);
    const isAdmin = roles.some((r: string) => ["super_admin", "admin", "manager"].includes(r));

    if (!isAdmin) {
      console.error(`[create-user] User ${callerId} is not admin. Roles: ${roles.join(", ")}`);
      return new Response(
        JSON.stringify({ error: "Acesso negado: requer permissão de administrador" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse body
    const body = await req.json();
    const { email, password, name, role, phone } = body;

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Email, senha e nome são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[create-user] Creating user: ${email}, role: ${role || "operator"}`);

    // 4. Criar usuário no Supabase Auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createError) {
      console.error("[create-user] Error creating auth user:", createError.message);

      // Traduzir mensagens de erro comuns
      let friendlyMessage = createError.message;
      if (createError.message.includes("already been registered") || createError.message.includes("already exists")) {
        friendlyMessage = "Este email já está cadastrado no sistema";
      }

      return new Response(
        JSON.stringify({ error: friendlyMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = newUser.user.id;
    console.log(`[create-user] Auth user created: ${newUserId}`);

    // 5. Criar/atualizar perfil (o trigger handle_new_user pode já ter criado)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          user_id: newUserId,
          name,
          email,
          phone: phone || null,
        },
        { onConflict: "user_id" }
      );

    if (profileError) {
      console.error("[create-user] Error creating profile:", profileError.message);
      // Não falha por causa disso - o trigger pode ter criado
    }

    // 6. Atribuir role (o trigger handle_new_user já cria com 'operator' por padrão)
    const targetRole = role || "operator";

    if (targetRole !== "operator") {
      // Primeiro, atualizar o role existente (criado pelo trigger)
      const { error: roleUpdateError } = await supabaseAdmin
        .from("user_roles")
        .update({ role: targetRole })
        .eq("user_id", newUserId);

      if (roleUpdateError) {
        console.error("[create-user] Error updating role:", roleUpdateError.message);
        // Tentar inserir se update não encontrou registro
        const { error: roleInsertError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: newUserId, role: targetRole });

        if (roleInsertError) {
          console.error("[create-user] Error inserting role:", roleInsertError.message);
        }
      }
    }

    console.log(`[create-user] Role assigned: ${targetRole}`);

    // 7. Criar permissões padrão baseadas no role
    const defaultModules = [
      "dashboard",
      "atendimento",
      "contatos",
      "kanban",
      "chat_interno",
      "agendamentos",
      "respostas_rapidas",
      "campanhas",
      "chatbot",
      "conexoes",
      "tags",
      "filas",
      "relatorios",
      "configuracoes",
      "usuarios",
      "integracoes",
    ];

    const isAdminRole = ["super_admin", "admin", "manager"].includes(targetRole);

    const permissions = defaultModules.map((module) => ({
      user_id: newUserId,
      module,
      can_view: true,
      can_edit: isAdminRole ? true : ["dashboard", "atendimento", "contatos", "kanban", "chat_interno", "agendamentos", "respostas_rapidas"].includes(module),
    }));

    const { error: permError } = await supabaseAdmin
      .from("user_permissions")
      .insert(permissions);

    if (permError) {
      console.error("[create-user] Error creating permissions:", permError.message);
      // Não é crítico, pode ser configurado depois
    }

    console.log(`[create-user] Permissions created for ${defaultModules.length} modules`);

    // 8. Registrar atividade
    await supabaseAdmin.from("activity_logs").insert({
      action: "create",
      entity_type: "user",
      entity_id: newUserId,
      user_id: callerId,
      metadata: {
        name,
        email,
        role: targetRole,
      },
    });

    console.log(`[create-user] Success: user ${email} created with role ${targetRole}`);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUserId,
          email,
          name,
          role: targetRole,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[create-user] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
