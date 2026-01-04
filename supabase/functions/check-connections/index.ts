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
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting connection health check...");

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

    console.log(`Checking ${connections.length} connections...`);

    const results = {
      checked: 0,
      stillConnected: 0,
      nowDisconnected: 0,
      errors: 0,
      details: [] as { id: string; name: string; status: string; newStatus?: string }[],
    };

    for (const connection of connections) {
      results.checked++;
      const instanceName = connection.session_data?.instanceName || connection.name;
      
      try {
        console.log(`Checking instance: ${instanceName} (${connection.id})`);
        
        // Check real status with Evolution API
        const statusResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
          headers: { "apikey": evolutionApiKey }
        });

        if (!statusResponse.ok) {
          console.error(`Error checking ${instanceName}: HTTP ${statusResponse.status}`);
          results.errors++;
          results.details.push({
            id: connection.id,
            name: connection.name,
            status: "error",
          });
          continue;
        }

        const statusResult = await statusResponse.json();
        console.log(`Status for ${instanceName}:`, JSON.stringify(statusResult));
        
        // Extract state from response (different API versions may have different formats)
        const connectionState = statusResult?.instance?.state || statusResult?.state;
        
        if (connectionState === 'open') {
          results.stillConnected++;
          results.details.push({
            id: connection.id,
            name: connection.name,
            status: "connected",
          });
          console.log(`${instanceName} is still connected`);
        } else {
          // Connection is actually disconnected
          console.log(`${instanceName} is disconnected (state: ${connectionState}), updating database...`);
          
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
        console.error(`Error checking ${instanceName}:`, error);
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
