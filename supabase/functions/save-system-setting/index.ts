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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- 1. Authenticate the caller ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !userData?.user) {
      console.error("[save-system-setting] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    console.log(`[save-system-setting] Authenticated user: ${userId}`);

    // --- 2. Verify admin/manager role using service role (bypasses RLS) ---
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleError) {
      console.error("[save-system-setting] Role check error:", roleError);
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const role = roleData?.role;
    const allowedRoles = ["admin", "manager", "super_admin"];
    if (!role || !allowedRoles.includes(role)) {
      console.warn(`[save-system-setting] Access denied for user ${userId}, role: ${role}`);
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Required: admin or manager" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[save-system-setting] User ${userId} authorized with role: ${role}`);

    // --- 3. Parse request body ---
    const { key, value, description, category } = await req.json();

    if (!key || value === undefined || value === null) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: key, value" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[save-system-setting] Saving key="${key}"`);

    // --- 4. Upsert logic using service role (bypasses RLS) ---
    // Step 4a: Fetch all rows with this key
    const { data: allRows, error: selectError } = await adminClient
      .from("system_settings")
      .select("id, updated_at")
      .eq("key", key)
      .order("updated_at", { ascending: false });

    if (selectError) {
      console.error("[save-system-setting] SELECT error:", selectError);
      return new Response(
        JSON.stringify({ error: "Failed to read settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rowCount = allRows?.length ?? 0;
    console.log(`[save-system-setting] Found ${rowCount} row(s) for key="${key}"`);

    // Step 4b: Clean up duplicates if any
    if (allRows && allRows.length > 1) {
      const idsToDelete = allRows.slice(1).map((r: { id: string }) => r.id);
      console.warn(`[save-system-setting] Cleaning ${idsToDelete.length} duplicate(s)`);
      const { error: deleteError } = await adminClient
        .from("system_settings")
        .delete()
        .in("id", idsToDelete);

      if (deleteError) {
        console.error("[save-system-setting] Duplicate cleanup error:", deleteError);
      }
    }

    const existing = allRows && allRows.length > 0 ? allRows[0] : null;

    // Step 4c: Update or Insert
    if (existing) {
      console.log(`[save-system-setting] Updating row id=${existing.id}`);
      const updatePayload: Record<string, string | undefined> = { value };
      if (description !== undefined) updatePayload.description = description;
      if (category !== undefined) updatePayload.category = category;

      const { error: updateError } = await adminClient
        .from("system_settings")
        .update(updatePayload)
        .eq("id", existing.id);

      if (updateError) {
        console.error("[save-system-setting] UPDATE failed, trying fallback:", updateError);
        // Fallback: delete all + insert fresh
        await adminClient.from("system_settings").delete().eq("key", key);
        const { error: insertError } = await adminClient
          .from("system_settings")
          .insert({ key, value, description, category });

        if (insertError) {
          console.error("[save-system-setting] Fallback INSERT failed:", insertError);
          return new Response(
            JSON.stringify({ error: "Failed to save setting" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    } else {
      console.log(`[save-system-setting] Inserting new row for key="${key}"`);
      const { error: insertError } = await adminClient
        .from("system_settings")
        .insert({ key, value, description, category });

      if (insertError) {
        console.error("[save-system-setting] INSERT failed:", insertError);
        // Race condition fallback: try update by key
        const { error: retryError } = await adminClient
          .from("system_settings")
          .update({ value, description, category })
          .eq("key", key);

        if (retryError) {
          console.error("[save-system-setting] Retry UPDATE also failed:", retryError);
          return new Response(
            JSON.stringify({ error: "Failed to save setting" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    console.log(`[save-system-setting] Successfully saved key="${key}"`);
    return new Response(
      JSON.stringify({ success: true, key }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[save-system-setting] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
