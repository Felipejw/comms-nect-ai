// ===========================================
// Admin Write - Generic admin table write handler
// Bypasses RLS using service_role for VPS environments
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// Whitelist of tables allowed for admin writes
const ALLOWED_TABLES = [
  "queues",
  "queue_agents",
  "tags",
  "contact_tags",
  "conversation_tags",
  "campaigns",
  "campaign_contacts",
  "chatbot_rules",
  "kanban_columns",
  "connections",
  "integrations",
  "ai_settings",
  "api_keys",
  "system_settings",
  "message_templates",
  "chatbot_flows",
  "flow_nodes",
  "flow_edges",
];

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[admin-write] Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized: missing token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getUser(token);

    if (claimsError || !claimsData?.user) {
      console.error("[admin-write] Auth error:", claimsError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.user.id;
    console.log(`[admin-write] Authenticated user: ${userId}`);

    // 2. Verify admin/manager role using service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError) {
      console.error("[admin-write] Error fetching roles:", rolesError.message);
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userRoles = (roles || []).map((r: any) => r.role);
    const isAdmin = userRoles.some((r: string) =>
      ["super_admin", "admin", "manager"].includes(r)
    );

    if (!isAdmin) {
      console.error(`[admin-write] User ${userId} lacks admin role. Roles: ${userRoles.join(", ")}`);
      return new Response(
        JSON.stringify({ error: "Forbidden: admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse request body
    const body = await req.json();
    const { table, operation, data, filters } = body;

    console.log(`[admin-write] Operation: ${operation} on table: ${table}`);

    // 4. Validate table
    if (!table || !ALLOWED_TABLES.includes(table)) {
      console.error(`[admin-write] Table not allowed: ${table}`);
      return new Response(
        JSON.stringify({
          error: `Table '${table}' is not allowed`,
          allowed: ALLOWED_TABLES,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Validate operation
    if (!["insert", "update", "delete", "upsert"].includes(operation)) {
      return new Response(
        JSON.stringify({ error: `Invalid operation: ${operation}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Execute operation with service role (bypasses RLS)
    let result: any;

    if (operation === "insert") {
      if (!data) {
        return new Response(
          JSON.stringify({ error: "Missing 'data' for insert" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from(table)
        .insert(data)
        .select();

      if (insertError) {
        console.error(`[admin-write] Insert error:`, insertError.message);
        return new Response(
          JSON.stringify({ error: insertError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      result = insertData;
    } else if (operation === "update") {
      if (!data || !filters || Object.keys(filters).length === 0) {
        return new Response(
          JSON.stringify({ error: "Missing 'data' or 'filters' for update" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let query = supabaseAdmin.from(table).update(data);
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value as string);
      }
      const { data: updateData, error: updateError } = await query.select();

      if (updateError) {
        console.error(`[admin-write] Update error:`, updateError.message);
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      result = updateData;
    } else if (operation === "delete") {
      if (!filters || Object.keys(filters).length === 0) {
        return new Response(
          JSON.stringify({ error: "Missing 'filters' for delete (safety requirement)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let query = supabaseAdmin.from(table).delete();
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value as string);
      }
      const { data: deleteData, error: deleteError } = await query.select();

      if (deleteError) {
        console.error(`[admin-write] Delete error:`, deleteError.message);
        return new Response(
          JSON.stringify({ error: deleteError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      result = deleteData;
    } else if (operation === "upsert") {
      if (!data) {
        return new Response(
          JSON.stringify({ error: "Missing 'data' for upsert" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const onConflict = body.onConflict || undefined;
      const queryBuilder = onConflict
        ? supabaseAdmin.from(table).upsert(data, { onConflict })
        : supabaseAdmin.from(table).upsert(data);

      const { data: upsertData, error: upsertError } = await queryBuilder.select();

      if (upsertError) {
        console.error(`[admin-write] Upsert error:`, upsertError.message);
        return new Response(
          JSON.stringify({ error: upsertError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      result = upsertData;
    }

    console.log(`[admin-write] Success: ${operation} on ${table}`);

    return new Response(
      JSON.stringify({ data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[admin-write] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
Deno.serve(handler);
