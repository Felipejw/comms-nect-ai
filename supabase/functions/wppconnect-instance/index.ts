import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WPPCONNECT_API_URL = Deno.env.get("WPPCONNECT_API_URL") || Deno.env.get("EVOLUTION_API_URL");
const WPPCONNECT_SECRET_KEY = Deno.env.get("WPPCONNECT_SECRET_KEY") || Deno.env.get("EVOLUTION_API_KEY");

interface SessionData {
  sessionName?: string;
  token?: string;
}

// Helper function to get session info from connection
async function getSessionInfo(supabaseClient: any, connectionId: string): Promise<{ sessionName: string; token: string } | null> {
  const { data: conn } = await supabaseClient
    .from("connections")
    .select("session_data, name")
    .eq("id", connectionId)
    .single();

  if (!conn) {
    console.log(`[WPPConnect] Connection not found: ${connectionId}`);
    return null;
  }

  const sessionData = conn.session_data as SessionData;
  const sessionName = sessionData?.sessionName || conn.name;
  const token = sessionData?.token;

  if (!sessionName) {
    console.log(`[WPPConnect] No session name found for connection: ${connectionId}`);
    return null;
  }

  return { sessionName, token: token || WPPCONNECT_SECRET_KEY || "" };
}

// Helper to generate token for a session
async function generateToken(sessionName: string): Promise<string | null> {
  try {
    console.log(`[WPPConnect] Generating token for session: ${sessionName}`);
    const response = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/${WPPCONNECT_SECRET_KEY}/generate-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      console.error(`[WPPConnect] Failed to generate token: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[WPPConnect] Token generated:`, data);
    return data.token || data.full || null;
  } catch (e) {
    console.error(`[WPPConnect] Error generating token:`, e);
    return null;
  }
}

// Helper to start session and get QR code
async function startSession(sessionName: string, token: string): Promise<{ qrCode: string | null; status: string }> {
  try {
    console.log(`[WPPConnect] Starting session: ${sessionName}`);
    
    const response = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/start-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });

    const data = await response.json();
    console.log(`[WPPConnect] Start session response:`, JSON.stringify(data));

    // Extract QR code from various possible locations
    let qrCode = data.qrcode || data.base64 || data.data?.qrcode || null;
    
    // Ensure proper data URI prefix
    if (qrCode && typeof qrCode === 'string' && !qrCode.startsWith("data:")) {
      qrCode = `data:image/png;base64,${qrCode}`;
    }

    const status = data.status || data.state || "connecting";
    
    return { qrCode, status };
  } catch (e) {
    console.error(`[WPPConnect] Error starting session:`, e);
    return { qrCode: null, status: "error" };
  }
}

// Helper to check session status
async function checkSessionStatus(sessionName: string, token: string): Promise<{ status: string; phoneNumber: string | null }> {
  try {
    const response = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/check-connection-session`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    const data = await response.json();
    console.log(`[WPPConnect] Session status:`, JSON.stringify(data));

    let status = "disconnected";
    if (data.status === true || data.state === "CONNECTED" || data.status === "CONNECTED") {
      status = "connected";
    } else if (data.status === "QRCODE" || data.state === "QRCODE" || data.status === "CONNECTING") {
      status = "connecting";
    }

    const phoneNumber = data.wuid?.split("@")[0] || data.phone || null;

    return { status, phoneNumber };
  } catch (e) {
    console.error(`[WPPConnect] Error checking status:`, e);
    return { status: "disconnected", phoneNumber: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, instanceName, connectionId } = await req.json();

    console.log(`[WPPConnect] Action: ${action}, instanceName: ${instanceName}, connectionId: ${connectionId}`);
    console.log(`[WPPConnect] API URL: ${WPPCONNECT_API_URL}`);

    if (!WPPCONNECT_API_URL || !WPPCONNECT_SECRET_KEY) {
      console.error("[WPPConnect] Missing credentials - URL:", !!WPPCONNECT_API_URL, "KEY:", !!WPPCONNECT_SECRET_KEY);
      throw new Error("WPPConnect API credentials not configured. Please set WPPCONNECT_API_URL and WPPCONNECT_SECRET_KEY secrets.");
    }

    switch (action) {
      case "create": {
        if (!instanceName || typeof instanceName !== 'string' || !instanceName.trim()) {
          throw new Error("Session name is required and must be a non-empty string");
        }

        const cleanSessionName = instanceName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

        // Generate token for this session
        const token = await generateToken(cleanSessionName);
        if (!token) {
          throw new Error("Failed to generate session token");
        }

        // Save connection to database first
        const { data: connection, error: dbError } = await supabaseClient
          .from("connections")
          .insert({
            name: cleanSessionName,
            type: "whatsapp",
            status: "connecting",
            qr_code: null,
            session_data: { sessionName: cleanSessionName, token },
          })
          .select()
          .single();

        if (dbError) {
          console.error("Database error:", dbError);
          throw dbError;
        }

        // Start session and get QR code
        const { qrCode, status } = await startSession(cleanSessionName, token);

        // Update database with QR if found
        if (qrCode) {
          await supabaseClient
            .from("connections")
            .update({ qr_code: qrCode })
            .eq("id", connection.id);
        }

        return new Response(
          JSON.stringify({
            success: true,
            connection: { ...connection, qr_code: qrCode },
            qrCode,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getQrCode": {
        const sessionInfo = await getSessionInfo(supabaseClient, connectionId);
        if (!sessionInfo) {
          throw new Error("Session not found for this connection");
        }

        // Start session to get fresh QR code
        const { qrCode, status } = await startSession(sessionInfo.sessionName, sessionInfo.token);

        // Update QR code in database
        if (qrCode) {
          await supabaseClient
            .from("connections")
            .update({ qr_code: qrCode, status: "connecting" })
            .eq("id", connectionId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            qrCode,
            needsRecreate: !qrCode,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "status": {
        const sessionInfo = await getSessionInfo(supabaseClient, connectionId);
        if (!sessionInfo) {
          await supabaseClient
            .from("connections")
            .update({ status: "disconnected" })
            .eq("id", connectionId);

          return new Response(
            JSON.stringify({
              success: true,
              status: "disconnected",
              state: "no_session",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { status, phoneNumber } = await checkSessionStatus(sessionInfo.sessionName, sessionInfo.token);

        // Update database
        await supabaseClient
          .from("connections")
          .update({
            status,
            phone_number: phoneNumber,
            qr_code: status === "connected" ? null : undefined,
          })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({
            success: true,
            status,
            phoneNumber,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        const sessionInfo = await getSessionInfo(supabaseClient, connectionId);
        if (!sessionInfo) {
          throw new Error("Session not found for this connection");
        }

        // Mark as disconnect requested
        await supabaseClient
          .from("connections")
          .update({ disconnect_requested: true })
          .eq("id", connectionId);

        // Logout session
        try {
          await fetch(`${WPPCONNECT_API_URL}/api/${sessionInfo.sessionName}/logout-session`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${sessionInfo.token}`,
            },
          });
        } catch (e) {
          console.error("[WPPConnect] Error logging out:", e);
        }

        // Update database
        await supabaseClient
          .from("connections")
          .update({
            status: "disconnected",
            qr_code: null,
            disconnect_requested: false,
          })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        const sessionInfo = await getSessionInfo(supabaseClient, connectionId);
        
        if (sessionInfo) {
          // Close session in WPPConnect
          try {
            await fetch(`${WPPCONNECT_API_URL}/api/${sessionInfo.sessionName}/close-session`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${sessionInfo.token}`,
              },
            });
          } catch (e) {
            console.error("[WPPConnect] Error closing session:", e);
          }
        }

        // Delete from database
        const { error: deleteError } = await supabaseClient
          .from("connections")
          .delete()
          .eq("id", connectionId);

        if (deleteError) {
          throw deleteError;
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "recreate": {
        const sessionInfo = await getSessionInfo(supabaseClient, connectionId);
        const sessionName = sessionInfo?.sessionName;

        if (!sessionName) {
          throw new Error("Session not found for this connection");
        }

        // Close existing session
        if (sessionInfo?.token) {
          try {
            await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/close-session`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${sessionInfo.token}`,
              },
            });
          } catch (e) {
            console.log("[WPPConnect] Error closing session (ignoring):", e);
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Generate new token
        const newToken = await generateToken(sessionName);
        if (!newToken) {
          throw new Error("Failed to generate new session token");
        }

        // Update token in database
        await supabaseClient
          .from("connections")
          .update({
            session_data: { sessionName, token: newToken },
            status: "connecting",
            qr_code: null,
          })
          .eq("id", connectionId);

        // Start session and get QR code
        const { qrCode } = await startSession(sessionName, newToken);

        // Update database with QR
        if (qrCode) {
          await supabaseClient
            .from("connections")
            .update({ qr_code: qrCode })
            .eq("id", connectionId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            qrCode,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "serverHealth": {
        const health: Record<string, any> = {
          apiUrl: WPPCONNECT_API_URL,
          hasSecretKey: !!WPPCONNECT_SECRET_KEY,
          timestamp: new Date().toISOString(),
        };

        try {
          const response = await fetch(`${WPPCONNECT_API_URL}/api/`, {
            method: "GET",
          });

          health.available = response.ok;
          health.status = response.status;
        } catch (e) {
          health.available = false;
          health.error = e instanceof Error ? e.message : "Unknown error";
        }

        return new Response(
          JSON.stringify({ success: true, health }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetchInstances": {
        try {
          const response = await fetch(`${WPPCONNECT_API_URL}/api/`, {
            method: "GET",
          });

          if (response.ok) {
            const data = await response.json();
            return new Response(
              JSON.stringify({ success: true, instances: data }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch (e) {
          console.error("[WPPConnect] Error fetching instances:", e);
        }

        return new Response(
          JSON.stringify({ success: true, instances: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "cleanupOrphanedInstances": {
        // Get all connections from database
        const { data: dbConnections } = await supabaseClient
          .from("connections")
          .select("name, session_data")
          .eq("type", "whatsapp");

        const dbSessionNames = new Set(
          (dbConnections || []).map((c: any) => c.session_data?.sessionName || c.name)
        );

        // Since WPPConnect doesn't have a list all sessions endpoint,
        // we can't really cleanup orphaned instances
        // Just return success with no deletions

        return new Response(
          JSON.stringify({ success: true, deleted: [], message: "Cleanup not supported for WPPConnect" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("[WPPConnect] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
