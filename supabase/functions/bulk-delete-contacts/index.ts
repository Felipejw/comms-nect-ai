import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user is authenticated and is admin/manager
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Authorization required" }, 401);
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    
    if (authError || !user) {
      return json({ error: "Invalid token" }, 401);
    }

    // Check if user is admin or manager
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = roleData?.role;
    if (!role || !["super_admin", "admin", "manager"].includes(role)) {
      return json({ error: "Admin or manager role required" }, 403);
    }

    const { contactIds } = await req.json();

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return json({ error: "contactIds must be a non-empty array" }, 400);
    }

    if (contactIds.length > 500) {
      return json({ error: "Maximum 500 contacts per batch" }, 400);
    }

    // Delete in batches of 100
    const batchSize = 100;
    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < contactIds.length; i += batchSize) {
      const batch = contactIds.slice(i, i + batchSize);
      const { error } = await adminClient
        .from("contacts")
        .delete()
        .in("id", batch);

      if (error) {
        failed += batch.length;
        errors.push(error.message);
      } else {
        deleted += batch.length;
      }
    }

    return json({ 
      success: true, 
      deleted, 
      failed,
      total: contactIds.length,
      ...(errors.length > 0 && { errors })
    });
  } catch (err) {
    console.error("[bulk-delete-contacts] Error:", err);
    return json({ error: "Internal server error", message: err instanceof Error ? err.message : "Unknown" }, 500);
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
