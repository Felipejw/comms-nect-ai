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
