import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// WAHA API configuration
const WAHA_API_URL = Deno.env.get("WAHA_API_URL") || Deno.env.get("EVOLUTION_API_URL");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") || Deno.env.get("EVOLUTION_API_KEY");

interface WAHASession {
  name: string;
  status: string;
  me?: {
    id: string;
    pushName: string;
  };
}

// Map WAHA status to our system status
function mapWAHAStatus(wahaStatus: string): string {
  const statusMap: Record<string, string> = {
    "STOPPED": "disconnected",
    "STARTING": "connecting",
    "SCAN_QR_CODE": "connecting",
    "WORKING": "connected",
    "FAILED": "disconnected",
  };
  return statusMap[wahaStatus] || "disconnected";
}

// Get session info from database
// deno-lint-ignore no-explicit-any
async function getSessionInfo(supabaseClient: any, connectionId: string) {
  const { data: connection, error } = await supabaseClient
    .from("connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (error || !connection) {
    throw new Error("Connection not found");
  }

  // deno-lint-ignore no-explicit-any
  const sessionData = connection.session_data as any;
  const sessionName = sessionData?.sessionName || connection.name.toLowerCase().replace(/\s+/g, "_");

  return { connection, sessionName };
}

// Create a new WAHA session
async function createSession(sessionName: string, webhookUrl: string): Promise<{ success: boolean; qrCode?: string; error?: string }> {
  if (!WAHA_API_URL) {
    return { success: false, error: "WAHA API URL not configured" };
  }

  console.log(`[WAHA] Creating session: ${sessionName}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (WAHA_API_KEY) {
    headers["X-Api-Key"] = WAHA_API_KEY;
  }

  try {
    // Create session with webhook configuration
    const createResponse = await fetch(`${WAHA_API_URL}/api/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: sessionName,
        start: true,
        config: {
          webhooks: [{
            url: webhookUrl,
            events: ["message", "session.status"],
          }],
        },
      }),
    });

    const createResult = await createResponse.json();
    console.log(`[WAHA] Create session result:`, JSON.stringify(createResult));

    if (!createResponse.ok && createResponse.status !== 422) {
      // 422 means session already exists, which is fine
      return { success: false, error: createResult.message || "Failed to create session" };
    }

    // Wait a bit for session to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get QR code
    const qrResponse = await fetch(`${WAHA_API_URL}/api/${sessionName}/auth/qr`, {
      headers,
    });

    if (qrResponse.ok) {
      const qrResult = await qrResponse.json();
      console.log(`[WAHA] QR code obtained`);
      return { success: true, qrCode: qrResult.value };
    }

    // If QR not available yet, return success without QR
    return { success: true };
  } catch (error) {
    console.error("[WAHA] Error creating session:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Get QR code for a session
async function getQrCode(sessionName: string): Promise<{ success: boolean; qrCode?: string; status?: string; error?: string }> {
  if (!WAHA_API_URL) {
    return { success: false, error: "WAHA API URL not configured" };
  }

  const headers: Record<string, string> = {};
  if (WAHA_API_KEY) {
    headers["X-Api-Key"] = WAHA_API_KEY;
  }

  try {
    // First check session status
    const statusResponse = await fetch(`${WAHA_API_URL}/api/sessions/${sessionName}`, {
      headers,
    });

    if (!statusResponse.ok) {
      return { success: false, error: "Session not found" };
    }

    const sessionInfo: WAHASession = await statusResponse.json();
    console.log(`[WAHA] Session status:`, JSON.stringify(sessionInfo));

    if (sessionInfo.status === "WORKING") {
      return { success: true, status: "connected" };
    }

    if (sessionInfo.status === "SCAN_QR_CODE") {
      // Get QR code
      const qrResponse = await fetch(`${WAHA_API_URL}/api/${sessionName}/auth/qr`, {
        headers,
      });

      if (qrResponse.ok) {
        const qrResult = await qrResponse.json();
        return { success: true, qrCode: qrResult.value, status: "connecting" };
      }
    }

    return { success: true, status: mapWAHAStatus(sessionInfo.status) };
  } catch (error) {
    console.error("[WAHA] Error getting QR code:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Check session status
async function checkSessionStatus(sessionName: string): Promise<{ success: boolean; status?: string; phoneNumber?: string; error?: string }> {
  if (!WAHA_API_URL) {
    return { success: false, error: "WAHA API URL not configured" };
  }

  const headers: Record<string, string> = {};
  if (WAHA_API_KEY) {
    headers["X-Api-Key"] = WAHA_API_KEY;
  }

  try {
    const response = await fetch(`${WAHA_API_URL}/api/sessions/${sessionName}`, {
      headers,
    });

    if (!response.ok) {
      return { success: false, error: "Session not found" };
    }

    const sessionInfo: WAHASession = await response.json();
    console.log(`[WAHA] Session ${sessionName} status:`, JSON.stringify(sessionInfo));

    const status = mapWAHAStatus(sessionInfo.status);
    const phoneNumber = sessionInfo.me?.id?.replace("@c.us", "");

    return { success: true, status, phoneNumber };
  } catch (error) {
    console.error("[WAHA] Error checking status:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Logout from session
async function logoutSession(sessionName: string): Promise<{ success: boolean; error?: string }> {
  if (!WAHA_API_URL) {
    return { success: false, error: "WAHA API URL not configured" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (WAHA_API_KEY) {
    headers["X-Api-Key"] = WAHA_API_KEY;
  }

  try {
    const response = await fetch(`${WAHA_API_URL}/api/sessions/${sessionName}/logout`, {
      method: "POST",
      headers,
    });

    console.log(`[WAHA] Logout response status: ${response.status}`);
    return { success: true };
  } catch (error) {
    console.error("[WAHA] Error logging out:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Delete session
async function deleteSession(sessionName: string): Promise<{ success: boolean; error?: string }> {
  if (!WAHA_API_URL) {
    return { success: false, error: "WAHA API URL not configured" };
  }

  const headers: Record<string, string> = {};
  if (WAHA_API_KEY) {
    headers["X-Api-Key"] = WAHA_API_KEY;
  }

  try {
    // First logout
    await logoutSession(sessionName);
    
    // Then stop the session
    await fetch(`${WAHA_API_URL}/api/sessions/${sessionName}/stop`, {
      method: "POST",
      headers,
    });

    // Then delete
    const response = await fetch(`${WAHA_API_URL}/api/sessions/${sessionName}`, {
      method: "DELETE",
      headers,
    });

    console.log(`[WAHA] Delete response status: ${response.status}`);
    return { success: true };
  } catch (error) {
    console.error("[WAHA] Error deleting session:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Check server health with extended info
async function checkServerHealth(): Promise<{ 
  success: boolean; 
  healthy?: boolean; 
  version?: string; 
  engine?: string;
  sessionsCount?: number;
  error?: string 
}> {
  if (!WAHA_API_URL) {
    return { success: false, error: "WAHA API URL not configured" };
  }

  const headers: Record<string, string> = {};
  if (WAHA_API_KEY) {
    headers["X-Api-Key"] = WAHA_API_KEY;
  }

  try {
    // Fetch version info
    const versionResponse = await fetch(`${WAHA_API_URL}/api/version`, { headers });
    
    if (!versionResponse.ok) {
      return { success: true, healthy: false };
    }
    
    const versionInfo = await versionResponse.json();
    
    // Fetch sessions count
    let sessionsCount = 0;
    try {
      const sessionsResponse = await fetch(`${WAHA_API_URL}/api/sessions`, { headers });
      if (sessionsResponse.ok) {
        const sessions = await sessionsResponse.json();
        sessionsCount = Array.isArray(sessions) ? sessions.length : 0;
      }
    } catch (e) {
      console.log("[WAHA] Could not fetch sessions count:", e);
    }

    return { 
      success: true, 
      healthy: true, 
      version: versionInfo.version || "unknown",
      engine: versionInfo.engine || "WEBJS",
      sessionsCount,
    };
  } catch (error) {
    console.error("[WAHA] Error checking server health:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const { action, instanceName, connectionId } = await req.json();
    console.log(`[WAHA Instance] Action: ${action}, Instance: ${instanceName}, Connection: ${connectionId}`);

    const webhookUrl = `${supabaseUrl}/functions/v1/waha-webhook`;

    switch (action) {
      case "create": {
        if (!instanceName) {
          return new Response(
            JSON.stringify({ success: false, error: "Instance name is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sessionName = instanceName.toLowerCase().replace(/\s+/g, "_");
        const result = await createSession(sessionName, webhookUrl);

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: false, error: result.error }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create connection in database
        const { data: connection, error: dbError } = await supabaseClient
          .from("connections")
          .insert({
            name: instanceName,
            type: "whatsapp",
            status: result.qrCode ? "connecting" : "disconnected",
            qr_code: result.qrCode || null,
            session_data: { sessionName, engine: "waha" },
          })
          .select()
          .single();

        if (dbError) {
          console.error("[WAHA] Error creating connection:", dbError);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to save connection" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, connection, qrCode: result.qrCode }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getQrCode": {
        if (!connectionId) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection ID is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { connection, sessionName } = await getSessionInfo(supabaseClient, connectionId);
        const result = await getQrCode(sessionName);

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: false, error: result.error }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update connection in database
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (result.qrCode) updates.qr_code = result.qrCode;
        if (result.status) updates.status = result.status;

        await supabaseClient
          .from("connections")
          .update(updates)
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true, qrCode: result.qrCode, status: result.status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "status": {
        if (!connectionId) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection ID is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { connection, sessionName } = await getSessionInfo(supabaseClient, connectionId);
        const result = await checkSessionStatus(sessionName);

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: false, error: result.error }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update connection in database
        const updates: Record<string, unknown> = { 
          status: result.status,
          updated_at: new Date().toISOString(),
        };
        if (result.phoneNumber) updates.phone_number = result.phoneNumber;
        if (result.status === "connected") updates.qr_code = null;

        await supabaseClient
          .from("connections")
          .update(updates)
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true, status: result.status, phoneNumber: result.phoneNumber }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        if (!connectionId) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection ID is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { sessionName } = await getSessionInfo(supabaseClient, connectionId);
        const result = await logoutSession(sessionName);

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: false, error: result.error }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabaseClient
          .from("connections")
          .update({ status: "disconnected", qr_code: null, updated_at: new Date().toISOString() })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        if (!connectionId) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection ID is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { sessionName } = await getSessionInfo(supabaseClient, connectionId);
        await deleteSession(sessionName);

        // Delete from database
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
            JSON.stringify({ success: false, error: "Connection ID is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { connection, sessionName } = await getSessionInfo(supabaseClient, connectionId);
        
        // Delete existing session
        await deleteSession(sessionName);
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create new session
        const result = await createSession(sessionName, webhookUrl);

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: false, error: result.error }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update connection
        await supabaseClient
          .from("connections")
          .update({
            status: "connecting",
            qr_code: result.qrCode || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true, qrCode: result.qrCode }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "serverHealth": {
        const result = await checkServerHealth();
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[WAHA Instance] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
