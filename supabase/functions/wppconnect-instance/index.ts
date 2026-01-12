import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Multi-instance configuration
interface WPPConnectInstance {
  url: string;
  priority: number;
  healthy: boolean;
  lastCheck: number;
}

// Get configured instances from environment
function getConfiguredInstances(): WPPConnectInstance[] {
  const instances: WPPConnectInstance[] = [];
  
// Primary instance (only WPPConnect)
  const primaryUrl = Deno.env.get("WPPCONNECT_API_URL");
  if (primaryUrl) {
    instances.push({ url: primaryUrl, priority: 1, healthy: true, lastCheck: 0 });
  }
  
  // Secondary instances (optional)
  const instance2Url = Deno.env.get("WPPCONNECT_API_URL_2");
  if (instance2Url) {
    instances.push({ url: instance2Url, priority: 2, healthy: true, lastCheck: 0 });
  }
  
  const instance3Url = Deno.env.get("WPPCONNECT_API_URL_3");
  if (instance3Url) {
    instances.push({ url: instance3Url, priority: 3, healthy: true, lastCheck: 0 });
  }
  
  // Load balancer URL (if configured, takes priority for new connections)
  const lbUrl = Deno.env.get("WPPCONNECT_LB_URL");
  if (lbUrl) {
    instances.unshift({ url: lbUrl, priority: 0, healthy: true, lastCheck: 0 });
  }
  
  return instances;
}

const WPPCONNECT_SECRET_KEY = Deno.env.get("WPPCONNECT_SECRET_KEY");

// Health check cache (in-memory, resets on cold start)
const healthCache: Map<string, { healthy: boolean; lastCheck: number }> = new Map();
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

interface SessionData {
  sessionName?: string;
  token?: string;
  instanceUrl?: string; // Store which instance this session belongs to
}

// Check instance health
async function checkInstanceHealth(url: string): Promise<boolean> {
  const cached = healthCache.get(url);
  const now = Date.now();
  
  if (cached && (now - cached.lastCheck) < HEALTH_CHECK_INTERVAL) {
    return cached.healthy;
  }
  
  try {
    const response = await fetch(`${url}/api/`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    const healthy = response.ok;
    healthCache.set(url, { healthy, lastCheck: now });
    return healthy;
  } catch (e) {
    healthCache.set(url, { healthy: false, lastCheck: now });
    return false;
  }
}

// Get best available instance (with load balancing)
async function getBestInstance(): Promise<string | null> {
  const instances = getConfiguredInstances();
  
  if (instances.length === 0) {
    return null;
  }
  
  // Check health of all instances in parallel
  const healthChecks = await Promise.all(
    instances.map(async (inst) => ({
      ...inst,
      healthy: await checkInstanceHealth(inst.url),
    }))
  );
  
  // Filter healthy instances and sort by priority
  const healthyInstances = healthChecks
    .filter(inst => inst.healthy)
    .sort((a, b) => a.priority - b.priority);
  
  if (healthyInstances.length === 0) {
    console.error("[WPPConnect] No healthy instances available");
    // Return first configured instance as fallback
    return instances[0]?.url || null;
  }
  
  // Simple round-robin among healthy instances with same priority
  const topPriority = healthyInstances[0].priority;
  const topTierInstances = healthyInstances.filter(i => i.priority === topPriority);
  
  // Use random selection for load distribution
  const selected = topTierInstances[Math.floor(Math.random() * topTierInstances.length)];
  console.log(`[WPPConnect] Selected instance: ${selected.url} (priority: ${selected.priority})`);
  
  return selected.url;
}

// Get instance URL for existing connection
async function getInstanceForConnection(supabaseClient: any, connectionId: string): Promise<string | null> {
  const { data: conn } = await supabaseClient
    .from("connections")
    .select("session_data")
    .eq("id", connectionId)
    .single();
  
  if (!conn) return null;
  
  const sessionData = conn.session_data as SessionData;
  
  // If connection has a specific instance URL, use it
  if (sessionData?.instanceUrl) {
    const isHealthy = await checkInstanceHealth(sessionData.instanceUrl);
    if (isHealthy) {
      return sessionData.instanceUrl;
    }
    console.warn(`[WPPConnect] Assigned instance ${sessionData.instanceUrl} is unhealthy, finding alternative`);
  }
  
  // Otherwise get best available
  return getBestInstance();
}

// Helper function to get session info from connection
async function getSessionInfo(supabaseClient: any, connectionId: string): Promise<{ sessionName: string; token: string; instanceUrl: string } | null> {
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
  
  // Get instance URL (from session or best available)
  let instanceUrl: string | null = sessionData?.instanceUrl || null;
  if (!instanceUrl) {
    instanceUrl = await getBestInstance();
  } else {
    // Verify instance is healthy
    const isHealthy = await checkInstanceHealth(instanceUrl);
    if (!isHealthy) {
      instanceUrl = await getBestInstance();
    }
  }

  if (!sessionName || !instanceUrl) {
    console.log(`[WPPConnect] Missing session info for connection: ${connectionId}`);
    return null;
  }

  return { sessionName, token: token || WPPCONNECT_SECRET_KEY || "", instanceUrl };
}

// Helper to generate token for a session
async function generateToken(instanceUrl: string, sessionName: string): Promise<string | null> {
  try {
    console.log(`[WPPConnect] Generating token for session: ${sessionName} on ${instanceUrl}`);
    
    // WPPConnect uses POST /api/:session/generate-token with secretkey in body
    const response = await fetch(`${instanceUrl}/api/${sessionName}/generate-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secretkey: WPPCONNECT_SECRET_KEY }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WPPConnect] Failed to generate token: ${response.status} - ${errorText}`);
      
      // Fallback: try legacy route format
      console.log(`[WPPConnect] Trying legacy token route...`);
      const legacyResponse = await fetch(`${instanceUrl}/api/${sessionName}/${WPPCONNECT_SECRET_KEY}/generate-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (legacyResponse.ok) {
        const legacyData = await legacyResponse.json();
        console.log(`[WPPConnect] Token generated (legacy):`, legacyData);
        return legacyData.token || legacyData.full || WPPCONNECT_SECRET_KEY;
      }
      
      // If both fail, use SECRET_KEY as token (some WPPConnect versions work this way)
      console.log(`[WPPConnect] Using SECRET_KEY as token fallback`);
      return WPPCONNECT_SECRET_KEY || null;
    }

    const data = await response.json();
    console.log(`[WPPConnect] Token generated:`, data);
    return data.token || data.full || WPPCONNECT_SECRET_KEY || null;
  } catch (e) {
    console.error(`[WPPConnect] Error generating token:`, e);
    // Fallback to SECRET_KEY
    return WPPCONNECT_SECRET_KEY || null;
  }
}

// Helper to start session and get QR code
async function startSession(instanceUrl: string, sessionName: string, token: string): Promise<{ qrCode: string | null; status: string }> {
  try {
    console.log(`[WPPConnect] Starting session: ${sessionName} on ${instanceUrl}`);
    
    const response = await fetch(`${instanceUrl}/api/${sessionName}/start-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });

    const data = await response.json();
    console.log(`[WPPConnect] Start session response:`, JSON.stringify(data));

    let qrCode = data.qrcode || data.base64 || data.data?.qrcode || null;
    
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
async function checkSessionStatus(instanceUrl: string, sessionName: string, token: string): Promise<{ status: string; phoneNumber: string | null }> {
  try {
    const response = await fetch(`${instanceUrl}/api/${sessionName}/check-connection-session`, {
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

    const { action, instanceName, connectionId, targetInstance } = await req.json();

    console.log(`[WPPConnect] Action: ${action}, instanceName: ${instanceName}, connectionId: ${connectionId}`);

    // Actions that work without WPPConnect configured (database-only operations)
    const instances = getConfiguredInstances();
    const dbOnlyActions = ["health", "delete", "status"];
    const requiresWppConnect = !dbOnlyActions.includes(action);
    
    if (requiresWppConnect && (instances.length === 0 || !WPPCONNECT_SECRET_KEY)) {
      console.error("[WPPConnect] Missing credentials");
      throw new Error("WPPConnect não configurado. Configure as variáveis WPPCONNECT_API_URL e WPPCONNECT_SECRET_KEY.");
    }

    switch (action) {
      case "create": {
        if (!instanceName || typeof instanceName !== 'string' || !instanceName.trim()) {
          throw new Error("Session name is required and must be a non-empty string");
        }

        const cleanSessionName = instanceName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

        // Select best instance for new connection
        const selectedInstance = targetInstance || await getBestInstance();
        if (!selectedInstance) {
          throw new Error("No WPPConnect instances available");
        }

        console.log(`[WPPConnect] Creating session on instance: ${selectedInstance}`);

        // Generate token for this session
        const token = await generateToken(selectedInstance, cleanSessionName);
        if (!token) {
          throw new Error("Failed to generate session token");
        }

        // Save connection to database with instance URL
        const { data: connection, error: dbError } = await supabaseClient
          .from("connections")
          .insert({
            name: cleanSessionName,
            type: "whatsapp",
            status: "connecting",
            qr_code: null,
            session_data: { 
              sessionName: cleanSessionName, 
              token,
              instanceUrl: selectedInstance 
            },
          })
          .select()
          .single();

        if (dbError) {
          console.error("Database error:", dbError);
          throw dbError;
        }

        // Start session and get QR code
        const { qrCode, status } = await startSession(selectedInstance, cleanSessionName, token);

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
            instanceUrl: selectedInstance,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getQrCode": {
        const sessionInfo = await getSessionInfo(supabaseClient, connectionId);
        if (!sessionInfo) {
          throw new Error("Session not found for this connection");
        }

        const { qrCode, status } = await startSession(sessionInfo.instanceUrl, sessionInfo.sessionName, sessionInfo.token);

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
            instanceUrl: sessionInfo.instanceUrl,
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

        const { status, phoneNumber } = await checkSessionStatus(sessionInfo.instanceUrl, sessionInfo.sessionName, sessionInfo.token);

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
            instanceUrl: sessionInfo.instanceUrl,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        const sessionInfo = await getSessionInfo(supabaseClient, connectionId);
        if (!sessionInfo) {
          throw new Error("Session not found for this connection");
        }

        await supabaseClient
          .from("connections")
          .update({ disconnect_requested: true })
          .eq("id", connectionId);

        try {
          await fetch(`${sessionInfo.instanceUrl}/api/${sessionInfo.sessionName}/logout-session`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${sessionInfo.token}`,
            },
          });
        } catch (e) {
          console.error("[WPPConnect] Error logging out:", e);
        }

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
          try {
            await fetch(`${sessionInfo.instanceUrl}/api/${sessionInfo.sessionName}/close-session`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${sessionInfo.token}`,
              },
            });
          } catch (e) {
            console.error("[WPPConnect] Error closing session:", e);
          }
        }

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
        if (sessionInfo?.token && sessionInfo?.instanceUrl) {
          try {
            await fetch(`${sessionInfo.instanceUrl}/api/${sessionName}/close-session`, {
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

        // Select new instance (may migrate to different instance if current is unhealthy)
        const newInstanceUrl = await getBestInstance();
        if (!newInstanceUrl) {
          throw new Error("No WPPConnect instances available");
        }

        // Generate new token
        const newToken = await generateToken(newInstanceUrl, sessionName);
        if (!newToken) {
          throw new Error("Failed to generate new session token");
        }

        // Update session data with new instance
        await supabaseClient
          .from("connections")
          .update({
            session_data: { sessionName, token: newToken, instanceUrl: newInstanceUrl },
            status: "connecting",
            qr_code: null,
          })
          .eq("id", connectionId);

        const { qrCode } = await startSession(newInstanceUrl, sessionName, newToken);

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
            instanceUrl: newInstanceUrl,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "serverHealth": {
        const allInstances = getConfiguredInstances();
        const healthResults = await Promise.all(
          allInstances.map(async (inst) => {
            const healthy = await checkInstanceHealth(inst.url);
            return {
              url: inst.url,
              priority: inst.priority,
              healthy,
              role: inst.priority === 0 ? "load-balancer" : inst.priority === 1 ? "primary" : "secondary",
            };
          })
        );

        const health = {
          instances: healthResults,
          totalInstances: allInstances.length,
          healthyInstances: healthResults.filter(h => h.healthy).length,
          hasSecretKey: !!WPPCONNECT_SECRET_KEY,
          timestamp: new Date().toISOString(),
          loadBalancerConfigured: allInstances.some(i => i.priority === 0),
        };

        return new Response(
          JSON.stringify({ success: true, health }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetchInstances": {
        const allInstances = getConfiguredInstances();
        const instanceDetails = await Promise.all(
          allInstances.map(async (inst) => {
            try {
              const response = await fetch(`${inst.url}/api/`, {
                method: "GET",
                signal: AbortSignal.timeout(5000),
              });
              const data = response.ok ? await response.json() : null;
              return {
                url: inst.url,
                priority: inst.priority,
                healthy: response.ok,
                data,
              };
            } catch (e) {
              return {
                url: inst.url,
                priority: inst.priority,
                healthy: false,
                error: e instanceof Error ? e.message : "Unknown error",
              };
            }
          })
        );

        return new Response(
          JSON.stringify({ success: true, instances: instanceDetails }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "migrateConnection": {
        // Migrate a connection to a different instance
        const { newInstanceUrl } = await req.json();
        
        if (!connectionId || !newInstanceUrl) {
          throw new Error("connectionId and newInstanceUrl are required");
        }

        const sessionInfo = await getSessionInfo(supabaseClient, connectionId);
        if (!sessionInfo) {
          throw new Error("Session not found");
        }

        // Verify new instance is healthy
        const isHealthy = await checkInstanceHealth(newInstanceUrl);
        if (!isHealthy) {
          throw new Error("Target instance is not healthy");
        }

        // Close session on old instance
        try {
          await fetch(`${sessionInfo.instanceUrl}/api/${sessionInfo.sessionName}/close-session`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${sessionInfo.token}` },
          });
        } catch (e) {
          console.log("[WPPConnect] Error closing old session:", e);
        }

        // Generate new token on new instance
        const newToken = await generateToken(newInstanceUrl, sessionInfo.sessionName);
        if (!newToken) {
          throw new Error("Failed to generate token on new instance");
        }

        // Update connection
        await supabaseClient
          .from("connections")
          .update({
            session_data: {
              sessionName: sessionInfo.sessionName,
              token: newToken,
              instanceUrl: newInstanceUrl,
            },
            status: "connecting",
            qr_code: null,
          })
          .eq("id", connectionId);

        const { qrCode } = await startSession(newInstanceUrl, sessionInfo.sessionName, newToken);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Connection migrated to new instance",
            newInstanceUrl,
            qrCode,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "cleanupOrphanedInstances": {
        const { data: dbConnections } = await supabaseClient
          .from("connections")
          .select("name, session_data")
          .eq("type", "whatsapp");

        const dbSessionNames = new Set(
          (dbConnections || []).map((c: any) => c.session_data?.sessionName || c.name)
        );

        return new Response(
          JSON.stringify({ 
            success: true, 
            deleted: [], 
            message: "Cleanup completed",
            dbConnectionsCount: dbSessionNames.size,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "health": {
        console.log("[WPPConnect] Running health check on all instances");
        
        const allInstances = getConfiguredInstances();
        
        // If no instances configured, return clear "not configured" status
        if (allInstances.length === 0) {
          const { data: dbConnections } = await supabaseClient
            .from("connections")
            .select("id")
            .eq("type", "whatsapp");

          return new Response(
            JSON.stringify({
              success: true,
              configured: false,
              message: "Nenhuma instância WPPConnect configurada. Configure a variável WPPCONNECT_API_URL.",
              summary: {
                totalInstances: 0,
                healthyInstances: 0,
                unhealthyInstances: 0,
                overallStatus: "not_configured",
                totalConnections: dbConnections?.length || 0,
              },
              instances: [],
              connectionsByInstance: {},
              timestamp: new Date().toISOString(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const healthResults = await Promise.all(
          allInstances.map(async (inst) => {
            const startTime = Date.now();
            let healthy = false;
            let responseTime = 0;
            let version = null;
            let activeSessions = 0;
            let error = null;

            try {
              const response = await fetch(`${inst.url}/api/`, {
                method: "GET",
                signal: AbortSignal.timeout(10000),
              });
              responseTime = Date.now() - startTime;
              healthy = response.ok;

              if (response.ok) {
                try {
                  const data = await response.json();
                  version = data.version || data.WPPConnect || null;
                } catch {
                  // Response wasn't JSON, but server is up
                }
              }

              // Try to get active sessions count
              try {
                const sessionsResponse = await fetch(`${inst.url}/api/show-all-sessions`, {
                  method: "GET",
                  headers: {
                    "Authorization": `Bearer ${WPPCONNECT_SECRET_KEY}`,
                  },
                  signal: AbortSignal.timeout(5000),
                });
                if (sessionsResponse.ok) {
                  const sessionsData = await sessionsResponse.json();
                  activeSessions = Array.isArray(sessionsData) 
                    ? sessionsData.length 
                    : (sessionsData.response?.length || 0);
                }
              } catch {
                // Ignore session count errors
              }
            } catch (e) {
              responseTime = Date.now() - startTime;
              error = e instanceof Error ? e.message : "Connection failed";
            }

            return {
              url: inst.url,
              priority: inst.priority,
              healthy,
              responseTime,
              version,
              activeSessions,
              error,
            };
          })
        );

        // Get database connections and their assigned instances
        const { data: dbConnections } = await supabaseClient
          .from("connections")
          .select("id, name, status, session_data")
          .eq("type", "whatsapp");

        const connectionsByInstance: Record<string, number> = {};
        (dbConnections || []).forEach((conn: any) => {
          const instanceUrl = conn.session_data?.instanceUrl || "unassigned";
          connectionsByInstance[instanceUrl] = (connectionsByInstance[instanceUrl] || 0) + 1;
        });

        const healthyCount = healthResults.filter(r => r.healthy).length;
        const totalCount = healthResults.length;

        return new Response(
          JSON.stringify({
            success: true,
            summary: {
              totalInstances: totalCount,
              healthyInstances: healthyCount,
              unhealthyInstances: totalCount - healthyCount,
              overallStatus: healthyCount === totalCount ? "healthy" : healthyCount > 0 ? "degraded" : "down",
              totalConnections: dbConnections?.length || 0,
            },
            instances: healthResults.map(r => ({
              ...r,
              assignedConnections: connectionsByInstance[r.url] || 0,
            })),
            connectionsByInstance,
            timestamp: new Date().toISOString(),
          }),
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
