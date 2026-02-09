// ===========================================
// Check Connections - Health check periódico das conexões WhatsApp
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Detect SSL/TLS errors
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

// Build internal Docker URL removing /baileys prefix
function buildInternalUrl(originalUrl: string, internalBase: string): string | null {
  try {
    const parsed = new URL(originalUrl);
    let path = parsed.pathname;
    if (path.startsWith("/baileys/")) {
      path = path.substring("/baileys".length);
    } else if (path.startsWith("/baileys")) {
      path = path.substring("/baileys".length) || "/";
    }
    return `${internalBase.replace(/\/$/, "")}${path}${parsed.search}`;
  } catch {
    return null;
  }
}

// Resilient fetch: HTTPS -> HTTP -> Docker internal
async function resilientFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (!isSSLError(error)) throw error;

    console.warn(`[check-connections] SSL error on ${url}, trying HTTP fallback`);

    const httpUrl = url.replace("https://", "http://");
    try {
      const httpResponse = await fetch(httpUrl, options);
      const contentType = httpResponse.headers.get("content-type") || "";
      if (httpResponse.status === 404 || (contentType.includes("text/html") && !contentType.includes("json"))) {
        console.warn(`[check-connections] HTTP fallback returned HTML/404, trying internal URL`);
      } else {
        return httpResponse;
      }
    } catch (httpError) {
      console.warn(`[check-connections] HTTP fallback also failed: ${httpError instanceof Error ? httpError.message : httpError}`);
    }

    // Tier 3: Docker internal
    const dockerUrl = buildInternalUrl(url, "http://baileys:3000");
    if (dockerUrl) {
      console.log(`[check-connections] Trying Docker internal URL: ${dockerUrl}`);
      return await fetch(dockerUrl, options);
    }

    throw error;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[check-connections] Starting connection health check...");

    const { data: connections, error: connError } = await supabaseAdmin
      .from("connections")
      .select("id, name, status, type, phone_number, updated_at, session_data, disconnect_requested")
      .neq("status", "disconnected");

    if (connError) {
      console.error("[check-connections] Error fetching connections:", connError.message);
      return new Response(
        JSON.stringify({ success: false, error: connError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!connections || connections.length === 0) {
      console.log("[check-connections] No active connections to check");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma conexão ativa", checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[check-connections] Checking ${connections.length} connections`);

    // Fetch Baileys URL and API Key
    const { data: baileysSettingsList } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["baileys_server_url", "baileys_api_key"]);

    const settingsMap = Object.fromEntries((baileysSettingsList || []).map((s: any) => [s.key, s.value]));
    const baileysUrl = settingsMap["baileys_server_url"] || "http://baileys:3000";
    const baileysApiKey = settingsMap["baileys_api_key"] || "";
    const baileysHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (baileysApiKey) baileysHeaders["X-API-Key"] = baileysApiKey;

    const results: Array<{
      id: string;
      name: string;
      previousStatus: string;
      currentStatus: string;
      changed: boolean;
    }> = [];

    for (const conn of connections) {
      const sessionData = conn.session_data as { sessionName?: string } | null;
      const sessionName = sessionData?.sessionName || conn.name || conn.id;
      let currentStatus = "disconnected";

      try {
        // Check disconnect request
        if (conn.disconnect_requested) {
          console.log(`[check-connections] Disconnect requested for ${sessionName}`);
          try {
            await resilientFetch(`${baileysUrl}/sessions/${sessionName}`, {
              method: "DELETE",
              headers: baileysHeaders,
            });
          } catch (e) {
            console.warn(`[check-connections] Failed to send disconnect to Baileys: ${e}`);
          }

          await supabaseAdmin
            .from("connections")
            .update({
              status: "disconnected",
              disconnect_requested: false,
              qr_code: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conn.id);

          results.push({
            id: conn.id,
            name: sessionName,
            previousStatus: conn.status || "unknown",
            currentStatus: "disconnected",
            changed: true,
          });
          continue;
        }

        // Check status - correct endpoint: GET /sessions/{name} (not /api/session/ or /status)
        const statusResponse = await resilientFetch(
          `${baileysUrl}/sessions/${sessionName}`,
          { method: "GET", headers: baileysHeaders }
        );

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          currentStatus = statusData.status || statusData.state || "disconnected";

          // Normalize status
          if (currentStatus === "open" || currentStatus === "connected" || currentStatus === "active") {
            currentStatus = "connected";
          } else if (currentStatus === "connecting" || currentStatus === "qr" || currentStatus === "waiting_qr") {
            currentStatus = "connecting";
          } else if (currentStatus === "close" || currentStatus === "closed" || currentStatus === "error") {
            currentStatus = "disconnected";
          }

          // Update phone if available
          const phone = statusData.phone_number || statusData.phoneNumber || statusData.jid?.split("@")[0];
          if (phone && phone !== conn.phone_number) {
            await supabaseAdmin
              .from("connections")
              .update({ phone_number: phone })
              .eq("id", conn.id);
          }
        } else {
          console.warn(`[check-connections] Baileys returned ${statusResponse.status} for ${sessionName}`);
          if (statusResponse.status === 404) {
            currentStatus = "disconnected";
          } else {
            currentStatus = conn.status || "disconnected";
          }
        }
      } catch (fetchErr) {
        console.warn(`[check-connections] Error reaching Baileys for ${sessionName}:`, fetchErr);
        if (conn.status === "connected") {
          const lastUpdate = new Date(conn.updated_at).getTime();
          const fiveMinutes = 5 * 60 * 1000;
          if (Date.now() - lastUpdate > fiveMinutes) {
            currentStatus = "disconnected";
          } else {
            currentStatus = conn.status || "connected";
          }
        } else {
          currentStatus = conn.status || "disconnected";
        }
      }

      // Update status if changed
      const changed = currentStatus !== conn.status;
      if (changed) {
        console.log(`[check-connections] ${sessionName}: ${conn.status} -> ${currentStatus}`);
        const updateData: any = {
          status: currentStatus,
          updated_at: new Date().toISOString(),
        };
        if (currentStatus === "disconnected") {
          updateData.qr_code = null;
        }
        await supabaseAdmin
          .from("connections")
          .update(updateData)
          .eq("id", conn.id);
      }

      results.push({
        id: conn.id,
        name: sessionName,
        previousStatus: conn.status || "unknown",
        currentStatus,
        changed,
      });
    }

    const changedCount = results.filter((r) => r.changed).length;
    console.log(`[check-connections] Done: ${results.length} checked, ${changedCount} changed`);

    return new Response(
      JSON.stringify({ success: true, checked: results.length, changed: changedCount, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[check-connections] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
