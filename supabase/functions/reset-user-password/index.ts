// ===========================================
// Reset User Password - Admin reseta senha de usuario
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
      console.error("[reset-password] Missing Authorization header");
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
      console.error("[reset-password] Auth error:", callerError?.message);
      return new Response(
        JSON.stringify({ error: "Não autorizado: token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerId = callerData.user.id;
    console.log(`[reset-password] Caller: ${callerId}`);

    // 2. Verificar se o chamador é admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const roles = (callerRoles || []).map((r: any) => r.role);
    const isAdmin = roles.some((r: string) => ["super_admin", "admin", "manager"].includes(r));

    if (!isAdmin) {
      console.error(`[reset-password] User ${callerId} is not admin. Roles: ${roles.join(", ")}`);
      return new Response(
        JSON.stringify({ error: "Acesso negado: requer permissão de administrador" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse body
    const body = await req.json();
    const { userId, newPassword } = body;

    if (!userId || !newPassword) {
      return new Response(
        JSON.stringify({ error: "userId e newPassword são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[reset-password] Resetting password for user: ${userId}`);

    // 4. Resetar senha via Admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error("[reset-password] Error updating password:", updateError.message);
      return new Response(
        JSON.stringify({ error: `Erro ao resetar senha: ${updateError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Buscar nome do usuario para o log
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("name, email")
      .eq("user_id", userId)
      .maybeSingle();

    // 6. Registrar atividade
    await supabaseAdmin.from("activity_logs").insert({
      action: "reset_password",
      entity_type: "user",
      entity_id: userId,
      user_id: callerId,
      metadata: {
        target_name: userProfile?.name || "Unknown",
        target_email: userProfile?.email || "Unknown",
      },
    });

    console.log(`[reset-password] Success: password reset for ${userProfile?.email || userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Senha alterada com sucesso",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[reset-password] Unexpected error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
