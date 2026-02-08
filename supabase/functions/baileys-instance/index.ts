import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Detect SSL/TLS errors and retry with HTTP fallback
function isSSLError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("certificate") ||
    msg.includes("ssl") ||
    msg.includes("tls") ||
    msg.includes("peer") ||
    msg.includes("handshake") ||
    msg.includes("secure connection") ||
    (error.name === "TypeError" && msg.includes("error sending request"))
  );
}

async function resilientFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (isSSLError(error)) {
      const httpUrl = url.replace("https://", "http://");
      console.warn(`[Baileys Instance] SSL error on ${url}, retrying with HTTP: ${httpUrl}`);
      console.warn(`[Baileys Instance] Original error: ${error instanceof Error ? error.message : error}`);
      return await fetch(httpUrl, options);
    }
    throw error;
  }
}

// Safely parse response (handles non-JSON responses like 502 HTML pages)
async function safeParseResponse(response: Response): Promise<{ success: boolean; [key: string]: unknown }> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error(`[Baileys Instance] Non-JSON response (status ${response.status}): ${text.substring(0, 200)}`);
    return {
      success: false,
      error: `Servidor Baileys retornou erro ${response.status}. Verifique se o servidor está rodando.`,
    };
  }
}

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
      case "create": {
        const sessionName = instanceName || `whatsapp_${Date.now()}`;

        // Create connection in database
        const { data: conn, error: connError } = await supabaseClient
          .from("connections")
          .insert({
            name: instanceName || "WhatsApp",
            type: "whatsapp",
            status: "connecting",
            session_data: { sessionName },
          })
          .select()
          .single();

        if (connError) {
          console.error("[Baileys Instance] Error creating connection:", connError);
          return new Response(
            JSON.stringify({ success: false, error: connError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[Baileys Instance] Connection created: ${conn.id}, session: ${sessionName}`);

        // Build webhook URL
        const webhookUrl = `${supabaseUrl}/functions/v1/baileys-webhook`;

        // Delegate session creation to baileys-create-session (async, non-blocking)
        try {
          const createSessionUrl = `${supabaseUrl}/functions/v1/baileys-create-session`;
          await fetch(createSessionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              connectionId: conn.id,
              sessionName,
              webhookUrl,
              baileysUrl,
              baileysApiKey,
            }),
          });
        } catch (err) {
          console.warn("[Baileys Instance] Failed to invoke baileys-create-session (non-blocking):", err);
        }

        return new Response(
          JSON.stringify({ success: true, connectionId: conn.id, sessionName }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getQrCode": {
        if (!connectionId) {
          return new Response(
            JSON.stringify({ success: false, error: "connectionId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: conn } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (!conn) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection not found", errorCode: "NOT_FOUND" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sessionData = conn.session_data as { sessionName?: string } | null;
        const sessionName = sessionData?.sessionName || conn.name.toLowerCase().replace(/\s+/g, "_");

        try {
          const response = await resilientFetch(`${baileysUrl}/sessions/${sessionName}/qr`, {
            method: "GET",
            headers,
          });

          const result = await safeParseResponse(response);

          if (result.success && result.qr) {
            // Update QR code in database
            await supabaseClient
              .from("connections")
              .update({
                qr_code: result.qr as string,
                status: "waiting_qr",
                updated_at: new Date().toISOString(),
              })
              .eq("id", connectionId);
          }

          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (fetchError) {
          console.error("[Baileys Instance] Error fetching QR:", fetchError);
          return new Response(
            JSON.stringify({
              success: false,
              error: fetchError instanceof Error ? fetchError.message : "Failed to fetch QR code",
              errorCode: "FETCH_ERROR",
            }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      case "status": {
        if (!connectionId) {
          return new Response(
            JSON.stringify({ success: false, error: "connectionId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: conn } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (!conn) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection not found", errorCode: "NOT_FOUND" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sessionData = conn.session_data as { sessionName?: string } | null;
        const sessionName = sessionData?.sessionName || conn.name.toLowerCase().replace(/\s+/g, "_");

        try {
          const response = await resilientFetch(`${baileysUrl}/sessions/${sessionName}/status`, {
            method: "GET",
            headers,
          });

          const result = await safeParseResponse(response);

          // Update connection status based on Baileys response
          if (result.success) {
            const newStatus = result.status === "connected" ? "connected" : (result.status as string) || conn.status;
            const updates: Record<string, unknown> = {
              status: newStatus,
              updated_at: new Date().toISOString(),
            };

            if (result.phoneNumber) {
              updates.phone_number = result.phoneNumber;
            }
            if (newStatus === "connected") {
              updates.qr_code = null;
            }

            await supabaseClient
              .from("connections")
              .update(updates)
              .eq("id", connectionId);
          }

          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (fetchError) {
          console.error("[Baileys Instance] Error checking status:", fetchError);
          return new Response(
            JSON.stringify({
              success: false,
              error: fetchError instanceof Error ? fetchError.message : "Failed to check status",
              errorCode: "FETCH_ERROR",
            }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      case "disconnect": {
        if (!connectionId) {
          return new Response(
            JSON.stringify({ success: false, error: "connectionId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: conn } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (!conn) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sessionData = conn.session_data as { sessionName?: string } | null;
        const sessionName = sessionData?.sessionName || conn.name.toLowerCase().replace(/\s+/g, "_");

        // Try to disconnect from Baileys server (resilient - don't fail if server is down)
        try {
          await resilientFetch(`${baileysUrl}/sessions/${sessionName}`, {
            method: "DELETE",
            headers,
          });
          console.log(`[Baileys Instance] Session ${sessionName} disconnected from server`);
        } catch (fetchError) {
          console.warn(`[Baileys Instance] Could not reach Baileys server to disconnect (will update DB anyway):`, fetchError);
        }

        // Always update database status
        await supabaseClient
          .from("connections")
          .update({
            status: "disconnected",
            qr_code: null,
            phone_number: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        if (!connectionId) {
          return new Response(
            JSON.stringify({ success: false, error: "connectionId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: conn } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (!conn) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sessionData = conn.session_data as { sessionName?: string } | null;
        const sessionName = sessionData?.sessionName || conn.name.toLowerCase().replace(/\s+/g, "_");

        // Try to delete from Baileys server (resilient)
        try {
          await resilientFetch(`${baileysUrl}/sessions/${sessionName}`, {
            method: "DELETE",
            headers,
          });
          console.log(`[Baileys Instance] Session ${sessionName} deleted from server`);
        } catch (fetchError) {
          console.warn(`[Baileys Instance] Could not reach Baileys server to delete (will delete from DB anyway):`, fetchError);
        }

        // Always delete from database
        await supabaseClient
          .from("connections")
          .delete()
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "recreate": {
        if (!connectionId) {
          return new Response(
            JSON.stringify({ success: false, error: "connectionId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: conn } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (!conn) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sessionData = conn.session_data as { sessionName?: string } | null;
        const sessionName = sessionData?.sessionName || conn.name.toLowerCase().replace(/\s+/g, "_");

        // Try to delete old session from server (resilient)
        try {
          await resilientFetch(`${baileysUrl}/sessions/${sessionName}`, {
            method: "DELETE",
            headers,
          });
          console.log(`[Baileys Instance] Old session ${sessionName} deleted`);
        } catch (fetchError) {
          console.warn(`[Baileys Instance] Could not delete old session (will recreate anyway):`, fetchError);
        }

        // Update connection status
        await supabaseClient
          .from("connections")
          .update({
            status: "connecting",
            qr_code: null,
            phone_number: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectionId);

        // Create new session via baileys-create-session
        const webhookUrl = `${supabaseUrl}/functions/v1/baileys-webhook`;
        try {
          const createSessionUrl = `${supabaseUrl}/functions/v1/baileys-create-session`;
          await fetch(createSessionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              connectionId,
              sessionName,
              webhookUrl,
              baileysUrl,
              baileysApiKey,
            }),
          });
        } catch (err) {
          console.warn("[Baileys Instance] Failed to invoke baileys-create-session for recreate:", err);
        }

        return new Response(
          JSON.stringify({ success: true, sessionName }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "serverHealth": {
        try {
          const response = await resilientFetch(`${baileysUrl}/health`, {
            method: "GET",
            headers,
          });

          const result = await safeParseResponse(response);

          return new Response(
            JSON.stringify({ success: true, ...result }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (fetchError) {
          console.error("[Baileys Instance] Health check failed:", fetchError);
          return new Response(
            JSON.stringify({
              success: false,
              error: fetchError instanceof Error ? fetchError.message : "Server unreachable",
            }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      case "cleanupOrphanedInstances": {
        try {
          // Get all sessions from Baileys server
          const response = await resilientFetch(`${baileysUrl}/sessions`, {
            method: "GET",
            headers,
          });

          const result = await safeParseResponse(response);
          const serverSessions = (result.sessions || result.data || []) as string[];

          // Get all connections from database
          const { data: dbConnections } = await supabaseClient
            .from("connections")
            .select("id, session_data, name")
            .eq("type", "whatsapp");

          const dbSessionNames = (dbConnections || []).map((c: { session_data: { sessionName?: string } | null; name: string }) => {
            const sd = c.session_data as { sessionName?: string } | null;
            return sd?.sessionName || c.name.toLowerCase().replace(/\s+/g, "_");
          });

          // Find orphaned sessions (on server but not in DB)
          const orphaned = serverSessions.filter((s: string) => !dbSessionNames.includes(s));
          const deleted: string[] = [];

          for (const sessionName of orphaned) {
            try {
              await resilientFetch(`${baileysUrl}/sessions/${sessionName}`, {
                method: "DELETE",
                headers,
              });
              deleted.push(sessionName);
              console.log(`[Baileys Instance] Cleaned up orphaned session: ${sessionName}`);
            } catch (err) {
              console.warn(`[Baileys Instance] Failed to cleanup orphaned session ${sessionName}:`, err);
            }
          }

          return new Response(
            JSON.stringify({ success: true, deleted, total: serverSessions.length }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (fetchError) {
          console.error("[Baileys Instance] Cleanup failed:", fetchError);
          return new Response(
            JSON.stringify({
              success: false,
              error: fetchError instanceof Error ? fetchError.message : "Failed to cleanup",
            }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
