import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const { action, connectionId, instanceName } = await req.json();
    console.log(`[Baileys Instance] Action: ${action}, ConnectionId: ${connectionId}`);

    // Buscar configuracao do servidor Baileys
    const { data: settings } = await supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_server_url")
      .single();

    const { data: apiKeySettings } = await supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_key")
      .single();

    const baileysUrl = settings?.value;
    const baileysApiKey = apiKeySettings?.value;

    if (!baileysUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Baileys server URL not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Headers para API Baileys
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (baileysApiKey) {
      headers["X-API-Key"] = baileysApiKey;
    }

    switch (action) {
      // ... keep existing code (all switch cases: create, getQrCode, status, disconnect, delete, recreate, serverHealth, default)
    }
  } catch (error) {
    console.error("[Baileys Instance] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
Deno.serve(handler);
