import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { contacts } = await req.json();

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return new Response(JSON.stringify({ error: "contacts array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit batch size
    if (contacts.length > 5000) {
      return new Response(JSON.stringify({ error: "Maximum 5000 contacts per batch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Validate and clean contacts
    const validContacts = contacts
      .filter((c: any) => c.name && c.name.trim())
      .map((c: any) => ({
        name: c.name.trim(),
        email: c.email?.trim() || null,
        phone: c.phone?.trim() || null,
        company: c.company?.trim() || null,
      }));

    if (validContacts.length === 0) {
      return new Response(JSON.stringify({ imported: 0, failed: 0, message: "No valid contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch insert in chunks of 500
    const CHUNK_SIZE = 500;
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < validContacts.length; i += CHUNK_SIZE) {
      const chunk = validContacts.slice(i, i + CHUNK_SIZE);
      const { data, error } = await adminClient
        .from("contacts")
        .insert(chunk)
        .select("id");

      if (error) {
        console.error("Batch insert error:", error.message);
        failed += chunk.length;
      } else {
        imported += data?.length || 0;
        failed += chunk.length - (data?.length || 0);
      }
    }

    return new Response(
      JSON.stringify({ imported, failed, total: validContacts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
