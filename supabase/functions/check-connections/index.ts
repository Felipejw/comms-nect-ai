import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting connection health check...");

    // Get Baileys server URL from settings
    const { data: baileysUrlSetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_server_url")
      .single();

    const { data: baileysApiKeySetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_key")
      .single();

    const baileysUrl = baileysUrlSetting?.value || Deno.env.get("BAILEYS_API_URL") || "http://baileys:3000";
    const baileysApiKey = baileysApiKeySetting?.value || Deno.env.get("BAILEYS_API_KEY");

    // Get all connections that are marked as connected
    const { data: connections, error: connError } = await supabaseAdmin
      .from("connections")
      .select("*")
      .eq("type", "whatsapp")
      .eq("status", "connected");

    if (connError) {
      console.error("Error fetching connections:", connError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch connections" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!connections || connections.length === 0) {
      console.log("No connected connections to check");
      return new Response(
        JSON.stringify({ success: true, message: "No connections to check", checked: 0, updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Checking ${connections.length} connections via Baileys API...`);

    const results = {
      checked: 0,
      stillConnected: 0,
      nowDisconnected: 0,
      errors: 0,
      details: [] as { id: string; name: string; status: string; newStatus?: string }[],
    };

    // Build headers for Baileys API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (baileysApiKey) {
      headers['X-API-Key'] = baileysApiKey;
    }

    for (const connection of connections) {
      results.checked++;
      const sessionData = connection.session_data as Record<string, unknown> | null;
      const sessionName = (sessionData?.sessionName as string) || connection.name.toLowerCase().replace(/\s+/g, "_");
      
      try {
        console.log(`Checking session: ${sessionName} (${connection.id})`);
        
        // Check real status with Baileys API
        const statusResponse = await fetch(`${baileysUrl}/sessions/${sessionName}/status`, {
          headers,
        });

        if (!statusResponse.ok) {
          console.error(`Error checking ${sessionName}: HTTP ${statusResponse.status}`);
          results.errors++;
          results.details.push({
            id: connection.id,
            name: connection.name,
            status: "error",
          });
          continue;
        }

        const statusResult = await statusResponse.json();
        console.log(`Status for ${sessionName}:`, JSON.stringify(statusResult));
        
        // Extract state from response
        const isConnected = statusResult?.data?.connected || statusResult?.connected || statusResult?.status === 'connected';
        
        if (isConnected) {
          results.stillConnected++;
          results.details.push({
            id: connection.id,
            name: connection.name,
            status: "connected",
          });
          console.log(`${sessionName} is still connected`);
        } else {
          // Connection is actually disconnected
          console.log(`${sessionName} is disconnected, updating database...`);
          
          await supabaseAdmin
            .from("connections")
            .update({ status: 'disconnected' })
            .eq("id", connection.id);
          
          results.nowDisconnected++;
          results.details.push({
            id: connection.id,
            name: connection.name,
            status: "disconnected",
            newStatus: "updated",
          });
        }
      } catch (error) {
        console.error(`Error checking ${sessionName}:`, error);
        results.errors++;
        results.details.push({
          id: connection.id,
          name: connection.name,
          status: "error",
        });
      }
    }

    console.log(`Health check complete. Checked: ${results.checked}, Still connected: ${results.stillConnected}, Disconnected: ${results.nowDisconnected}, Errors: ${results.errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Checked ${results.checked} connections`,
        ...results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in check-connections:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
