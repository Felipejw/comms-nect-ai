// ===========================================
// Delete User - Remove usuario do sistema
// Resiliente: ignora "User not found" do Auth
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Autenticar o chamador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[delete-user] Missing Authorization header");
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
      console.error("[delete-user] Auth error:", callerError?.message);
      return new Response(
        JSON.stringify({ error: "Não autorizado: token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerId = callerData.user.id;
    console.log(`[delete-user] Caller: ${callerId}`);

    // 2. Verificar se o chamador é admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const roles = (callerRoles || []).map((r: any) => r.role);
    const isAdmin = roles.some((r: string) => ["super_admin", "admin", "manager"].includes(r));

    if (!isAdmin) {
      console.error(`[delete-user] User ${callerId} is not admin. Roles: ${roles.join(", ")}`);
      return new Response(
        JSON.stringify({ error: "Acesso negado: requer permissão de administrador" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse body
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Impedir auto-exclusão
    if (userId === callerId) {
      return new Response(
        JSON.stringify({ error: "Não é possível excluir o próprio usuário" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[delete-user] Deleting user: ${userId}`);

    // 4. Buscar dados do usuario antes de excluir (para log)
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("name, email")
      .eq("user_id", userId)
      .maybeSingle();

    const userName = userProfile?.name || "Unknown";
    const userEmail = userProfile?.email || "Unknown";

    // 5. Limpar dados relacionados (antes de excluir do Auth)
    // Remover permissões
    const { error: permError } = await supabaseAdmin
      .from("user_permissions")
      .delete()
      .eq("user_id", userId);

    if (permError) {
      console.warn(`[delete-user] Error deleting permissions: ${permError.message}`);
    }

    // Remover roles
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (roleError) {
      console.warn(`[delete-user] Error deleting roles: ${roleError.message}`);
    }

    // Remover perfil
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("user_id", userId);

    if (profileError) {
      console.warn(`[delete-user] Error deleting profile: ${profileError.message}`);
    }

    // Desatribuir conversas do usuario
    const { error: convError } = await supabaseAdmin
      .from("conversations")
      .update({ assigned_to: null })
      .eq("assigned_to", userId);

    if (convError) {
      console.warn(`[delete-user] Error unassigning conversations: ${convError.message}`);
    }

    // Remover de filas
    const { error: queueError } = await supabaseAdmin
      .from("queue_agents")
      .delete()
      .eq("user_id", userId);

    if (queueError) {
      console.warn(`[delete-user] Error removing from queues: ${queueError.message}`);
    }

    console.log(`[delete-user] Database cleanup completed for ${userId}`);

    // 6. Excluir do Supabase Auth (resiliente a "User not found")
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      const msg = deleteAuthError.message || "";
      // Ignorar erro de "User not found" - já foi excluído
      if (msg.includes("not found") || msg.includes("User not found")) {
        console.warn(`[delete-user] Auth user already deleted or not found: ${userId}`);
      } else {
        console.error(`[delete-user] Error deleting auth user: ${msg}`);
        return new Response(
          JSON.stringify({ error: `Erro ao excluir usuário: ${msg}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 7. Registrar atividade
    await supabaseAdmin.from("activity_logs").insert({
      action: "delete",
      entity_type: "user",
      entity_id: userId,
      user_id: callerId,
      metadata: {
        deleted_name: userName,
        deleted_email: userEmail,
      },
    });

    console.log(`[delete-user] Success: user ${userEmail} (${userId}) deleted`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${userName} excluído com sucesso`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[delete-user] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
Deno.serve(handler);
