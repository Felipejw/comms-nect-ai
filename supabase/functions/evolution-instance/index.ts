import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

// Helper function to get instance name from connection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getInstanceName(supabaseClient: any, connectionId: string): Promise<string | null> {
  const { data: conn } = await supabaseClient
    .from("connections")
    .select("session_data, name")
    .eq("id", connectionId)
    .single();

  if (!conn) {
    console.log(`[Evolution Instance] Connection not found: ${connectionId}`);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connData = conn as any;
  const instName = connData.session_data?.instanceName || connData.name;
  
  if (!instName) {
    console.log(`[Evolution Instance] No instance name found for connection: ${connectionId}`);
    return null;
  }

  return instName;
}

// Helper to check if instance exists in Evolution API
async function instanceExists(instanceName: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
      method: "GET",
      headers,
    });
    
    if (!response.ok) {
      const data = await response.json();
      // Check for specific "not found" errors
      if (data.message?.includes("not found") || data.error?.includes("not found")) {
        return false;
      }
    }
    
    return response.ok;
  } catch (e) {
    console.log(`[Evolution Instance] Error checking instance existence: ${e}`);
    return false;
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

    console.log(`[Evolution Instance] Action: ${action}, instanceName: ${instanceName}, connectionId: ${connectionId}`);
    console.log(`[Evolution Instance] API URL: ${EVOLUTION_API_URL}`);

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.error("[Evolution Instance] Missing credentials - URL:", !!EVOLUTION_API_URL, "KEY:", !!EVOLUTION_API_KEY);
      throw new Error("Evolution API credentials not configured. Please set EVOLUTION_API_URL and EVOLUTION_API_KEY secrets.");
    }

    const evolutionHeaders = {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_API_KEY,
    };

    switch (action) {
      case "create": {
        // Validate instanceName
        if (!instanceName || typeof instanceName !== 'string' || !instanceName.trim()) {
          throw new Error("Instance name is required and must be a non-empty string");
        }

        const cleanInstanceName = instanceName.trim();

        // Get Supabase URL for webhook
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        
        // First, fetch actual instances from Evolution API to check if exists
        console.log("[Evolution Instance] Fetching existing instances from Evolution API...");
        try {
          const instancesResponse = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
            method: "GET",
            headers: evolutionHeaders,
          });
          
          if (instancesResponse.ok) {
            const instances = await instancesResponse.json();
            console.log(`[Evolution Instance] Found ${instances?.length || 0} instances in Evolution API`);
            
            // Check if our instance exists in the actual list
            const existingInstance = Array.isArray(instances) 
              ? instances.find((i: { instance?: { instanceName?: string } }) => 
                  i.instance?.instanceName === cleanInstanceName)
              : null;
            
            if (existingInstance) {
              console.log(`[Evolution Instance] Instance ${cleanInstanceName} exists, deleting...`);
              try {
                const deleteResp = await fetch(`${EVOLUTION_API_URL}/instance/delete/${cleanInstanceName}`, {
                  method: "DELETE",
                  headers: evolutionHeaders,
                });
                console.log(`[Evolution Instance] Delete response: ${deleteResp.status}`);
                // Ignore delete errors - instance might be in an inconsistent state
              } catch (deleteError) {
                console.log(`[Evolution Instance] Delete error (ignoring): ${deleteError}`);
              }
              await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
              console.log("[Evolution Instance] Instance not found in Evolution API, proceeding with create");
            }
          }
        } catch (e) {
          console.log(`[Evolution Instance] Error fetching instances (ignoring): ${e}`);
        }
        
        // Create instance in Evolution API with QR code enabled and webhook
        const createResponse = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: "POST",
          headers: evolutionHeaders,
          body: JSON.stringify({
            instanceName: cleanInstanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: {
              url: `${SUPABASE_URL}/functions/v1/evolution-webhook`,
              byEvents: false,
              base64: true,
              events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"]
            }
          }),
        });

        const createData = await createResponse.json();
        console.log("[Evolution Instance] Create response status:", createResponse.status);
        console.log("[Evolution Instance] Create FULL response:", JSON.stringify(createData, null, 2));

        if (!createResponse.ok) {
          console.error("[Evolution Instance] Create failed:", createData);
          throw new Error(createData.message || createData.error || "Failed to create instance");
        }

        // Save connection to database first
        const { data: connection, error: dbError } = await supabaseClient
          .from("connections")
          .insert({
            name: cleanInstanceName,
            type: "whatsapp",
            status: "connecting",
            qr_code: null,
            session_data: { instanceName: cleanInstanceName },
          })
          .select()
          .single();

        if (dbError) {
          console.error("Database error:", dbError);
          throw dbError;
        }

        // Wait for Evolution API to initialize the WhatsApp connection and database
        console.log("[Evolution Instance] Waiting 5s for Evolution API database initialization...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify instance was actually created in Evolution API before trying to connect
        let instanceReady = false;
        for (let verifyAttempt = 0; verifyAttempt < 3; verifyAttempt++) {
          console.log(`[Evolution Instance] Verifying instance creation (attempt ${verifyAttempt + 1}/3)...`);
          try {
            const verifyResponse = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
              method: "GET",
              headers: evolutionHeaders,
            });
            
            if (verifyResponse.ok) {
              const allInstances = await verifyResponse.json();
              const ourInstance = Array.isArray(allInstances) 
                ? allInstances.find((i: { instance?: { instanceName?: string } }) => 
                    i.instance?.instanceName === cleanInstanceName)
                : null;
              
              if (ourInstance) {
                console.log("[Evolution Instance] Instance verified in Evolution API database");
                instanceReady = true;
                break;
              } else {
                console.log("[Evolution Instance] Instance not yet in database, waiting...");
              }
            }
          } catch (e) {
            console.log(`[Evolution Instance] Verify attempt failed: ${e}`);
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (!instanceReady) {
          console.log("[Evolution Instance] WARNING: Could not verify instance creation, proceeding anyway...");
        }

        // Now fetch QR code using the connect endpoint - this forces QR generation
        let qrCodeBase64 = null;
        
        for (let attempt = 0; attempt < 6; attempt++) {
          console.log(`[Evolution Instance] Fetch QR attempt ${attempt + 1}/6...`);
          
          try {
            const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${cleanInstanceName}`, {
              method: "GET",
              headers: evolutionHeaders,
            });

            const qrData = await qrResponse.json();
            console.log(`[Evolution Instance] Connect response (attempt ${attempt + 1}):`, JSON.stringify(qrData));

            // Check for error indicating instance doesn't exist
            if (qrData.error || qrData.message?.includes("not found")) {
              console.log("[Evolution Instance] Instance not found error, skipping...");
              break;
            }

            // Check for base64 QR directly
            if (qrData.base64) {
              qrCodeBase64 = qrData.base64.startsWith("data:") 
                ? qrData.base64 
                : `data:image/png;base64,${qrData.base64}`;
              console.log("[Evolution Instance] Got base64 QR from connect endpoint");
              break;
            }
            
            // Check for code string (WhatsApp connection string)
            if (qrData.code && typeof qrData.code === 'string' && qrData.code.length > 20) {
              console.log("[Evolution Instance] Got QR code string, generating image...");
              try {
                const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData.code)}`;
                const qrImageResponse = await fetch(qrApiUrl);
                
                if (qrImageResponse.ok) {
                  const arrayBuffer = await qrImageResponse.arrayBuffer();
                  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                  qrCodeBase64 = `data:image/png;base64,${base64}`;
                  console.log("[Evolution Instance] QR code image generated from string");
                  break;
                }
              } catch (e) {
                console.error("[Evolution Instance] Failed to generate QR from string:", e);
              }
            }
            
            // Check for pairingCode as fallback
            if (qrData.pairingCode) {
              console.log(`[Evolution Instance] Got pairing code: ${qrData.pairingCode}`);
              // Store pairing code in session_data for UI to display
              await supabaseClient
                .from("connections")
                .update({ 
                  session_data: { 
                    instanceName: cleanInstanceName,
                    pairingCode: qrData.pairingCode 
                  }
                })
                .eq("id", connection.id);
            }
            
            // If count is 0 and no QR, wait longer
            if (qrData.count === 0) {
              console.log("[Evolution Instance] QR count is 0, waiting for WhatsApp to generate...");
            }
          } catch (e) {
            console.error(`[Evolution Instance] Connect attempt ${attempt + 1} failed:`, e);
          }
          
          // Wait 3 seconds before next retry (longer wait for database sync)
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Update database with QR if found
        if (qrCodeBase64) {
          await supabaseClient
            .from("connections")
            .update({ qr_code: qrCodeBase64 })
            .eq("id", connection.id);
        } else {
          console.log("[Evolution Instance] WARNING: Could not get QR code after all attempts");
        }

        return new Response(
          JSON.stringify({
            success: true,
            connection: { ...connection, qr_code: qrCodeBase64 },
            qrCode: qrCodeBase64,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getQrCode": {
        // Get instance name from database
        const instName = await getInstanceName(supabaseClient, connectionId);
        
        if (!instName) {
          throw new Error("Instance name not found for this connection");
        }

        // Check if instance exists
        const exists = await instanceExists(instName, evolutionHeaders);
        if (!exists) {
          console.log(`[Evolution Instance] Instance ${instName} does not exist in Evolution API`);
          return new Response(
            JSON.stringify({
              success: true,
              qrCode: null,
              needsRecreate: true,
              message: "Instance not found in Evolution API. Please recreate the connection.",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Fetch the QR code from connect endpoint
        const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instName}`, {
          method: "GET",
          headers: evolutionHeaders,
        });

        const qrData = await qrResponse.json();
        console.log("[Evolution Instance] Get QR response:", JSON.stringify(qrData));

        let qrCodeBase64 = null;
        
        // Check for base64 first (some Evolution versions return it)
        if (qrData.base64) {
          qrCodeBase64 = qrData.base64.startsWith("data:") 
            ? qrData.base64 
            : `data:image/png;base64,${qrData.base64}`;
        }
        
        // If we have the QR string code, generate the image using a QR code API
        if (!qrCodeBase64 && qrData.code) {
          console.log("[Evolution Instance] Generating QR from code string...");
          try {
            // Use a public QR code generation API
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData.code)}`;
            const qrImageResponse = await fetch(qrApiUrl);
            
            if (qrImageResponse.ok) {
              const arrayBuffer = await qrImageResponse.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
              qrCodeBase64 = `data:image/png;base64,${base64}`;
              console.log("[Evolution Instance] QR code generated from string");
            }
          } catch (e) {
            console.error("[Evolution Instance] Failed to generate QR from string:", e);
          }
        }

        // Update QR code in database
        if (qrCodeBase64) {
          await supabaseClient
            .from("connections")
            .update({ qr_code: qrCodeBase64, status: "connecting" })
            .eq("id", connectionId);
        } else {
          console.log("[Evolution Instance] No QR code available, instance might need to be recreated");
        }

        return new Response(
          JSON.stringify({
            success: true,
            qrCode: qrCodeBase64,
            qrString: qrData.code,
            pairingCode: qrData.pairingCode,
            count: qrData.count,
            needsRecreate: !qrCodeBase64 && qrData.count === 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "restart": {
        const instName = await getInstanceName(supabaseClient, connectionId);
        
        if (!instName) {
          throw new Error("Instance name not found for this connection");
        }

        console.log(`[Evolution Instance] Restarting instance ${instName}...`);

        const restartResponse = await fetch(`${EVOLUTION_API_URL}/instance/restart/${instName}`, {
          method: "PUT",
          headers: evolutionHeaders,
        });

        console.log("[Evolution Instance] Restart response status:", restartResponse.status);

        // Update status to connecting
        await supabaseClient
          .from("connections")
          .update({ status: "connecting", qr_code: null })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "status": {
        const instName = await getInstanceName(supabaseClient, connectionId);
        
        if (!instName) {
          // Connection exists in DB but has no instance name - mark as disconnected
          await supabaseClient
            .from("connections")
            .update({ status: "disconnected" })
            .eq("id", connectionId);
            
          return new Response(
            JSON.stringify({
              success: true,
              status: "disconnected",
              state: "no_instance",
              message: "No instance name found",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if instance exists in Evolution API
        const exists = await instanceExists(instName, evolutionHeaders);
        
        if (!exists) {
          console.log(`[Evolution Instance] Instance ${instName} not found in Evolution API`);
          await supabaseClient
            .from("connections")
            .update({ status: "disconnected", qr_code: null })
            .eq("id", connectionId);
            
          return new Response(
            JSON.stringify({
              success: true,
              status: "disconnected",
              state: "not_found",
              needsRecreate: true,
              message: "Instance not found in Evolution API",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const statusResponse = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instName}`, {
          method: "GET",
          headers: evolutionHeaders,
        });

        const statusData = await statusResponse.json();
        console.log("[Evolution Instance] Status response:", JSON.stringify(statusData));

        const state = statusData.instance?.state;
        const isConnected = state === "open";
        const newStatus = isConnected ? "connected" : state === "close" ? "disconnected" : "connecting";

        // Update status in database
        const updateData: { status: string; qr_code?: null; phone_number?: string } = { 
          status: newStatus 
        };
        
        if (isConnected) {
          updateData.qr_code = null;
        }

        await supabaseClient
          .from("connections")
          .update(updateData)
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({
            success: true,
            status: newStatus,
            state: state,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetchInstances": {
        // Fetch all instances from Evolution API
        const instancesResponse = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
          method: "GET",
          headers: evolutionHeaders,
        });

        const instancesData = await instancesResponse.json();
        console.log("Fetch instances response:", JSON.stringify(instancesData));

        return new Response(
          JSON.stringify({
            success: true,
            instances: instancesData,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        const instName = await getInstanceName(supabaseClient, connectionId);

        if (instName) {
          const logoutResponse = await fetch(`${EVOLUTION_API_URL}/instance/logout/${instName}`, {
            method: "DELETE",
            headers: evolutionHeaders,
          });

          console.log("Logout response:", logoutResponse.status);
        }

        // Update status in database
        await supabaseClient
          .from("connections")
          .update({ status: "disconnected", qr_code: null, phone_number: null })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        const instName = await getInstanceName(supabaseClient, connectionId);

        if (instName) {
          const deleteResponse = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instName}`, {
            method: "DELETE",
            headers: evolutionHeaders,
          });

          console.log("Delete instance response:", deleteResponse.status);
        }

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
        const instName = await getInstanceName(supabaseClient, connectionId);

        if (!instName) {
          throw new Error("Instance name not found for this connection. Please delete and create a new connection.");
        }

        console.log(`[Evolution Instance] Recreating instance ${instName}...`);

        // 1. Try to delete existing instance from Evolution API (ignore errors)
        try {
          const deleteResponse = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instName}`, {
            method: "DELETE",
            headers: evolutionHeaders,
          });
          console.log("[Evolution Instance] Delete response:", deleteResponse.status);
        } catch (e) {
          console.log("[Evolution Instance] Delete failed (might not exist):", e);
        }

        // 2. Wait 2 seconds for delete to take effect
        console.log("[Evolution Instance] Waiting 2s after delete...");
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Get Supabase URL for webhook
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

        // 4. Create new instance with QR code and webhook configuration
        const createResponse = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: "POST",
          headers: evolutionHeaders,
          body: JSON.stringify({
            instanceName: instName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: {
              url: `${SUPABASE_URL}/functions/v1/evolution-webhook`,
              byEvents: false,
              base64: true,
              events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"]
            }
          }),
        });

        const createData = await createResponse.json();
        console.log("[Evolution Instance] Recreate FULL response:", JSON.stringify(createData, null, 2));

        if (!createResponse.ok) {
          throw new Error(createData.message || createData.error || "Failed to recreate instance");
        }

        // 5. Extract QR code from response
        let qrCodeBase64 = null;
        if (createData.qrcode?.base64) {
          qrCodeBase64 = createData.qrcode.base64;
        } else if (createData.base64) {
          qrCodeBase64 = createData.base64;
        }

        // Ensure proper data URI prefix
        if (qrCodeBase64 && !qrCodeBase64.startsWith("data:")) {
          qrCodeBase64 = `data:image/png;base64,${qrCodeBase64}`;
        }

        // 6. If no QR from create, restart instance and retry fetching via connect endpoint
        if (!qrCodeBase64) {
          console.log("[Evolution Instance] No QR from create, restarting instance...");
          
          // Call restart to force new QR generation
          try {
            await fetch(`${EVOLUTION_API_URL}/instance/restart/${instName}`, {
              method: "PUT",
              headers: evolutionHeaders,
            });
            console.log("[Evolution Instance] Restart called, waiting 5s...");
          } catch (e) {
            console.log("[Evolution Instance] Restart failed:", e);
          }
          
          // Wait longer for WhatsApp to initialize
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          for (let attempt = 0; attempt < 5; attempt++) {
            console.log(`[Evolution Instance] Connect attempt ${attempt + 1}/5...`);
            
            try {
              const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instName}`, {
                method: "GET",
                headers: evolutionHeaders,
              });
              
              const qrData = await qrResponse.json();
              console.log(`[Evolution Instance] Connect response (attempt ${attempt + 1}):`, JSON.stringify(qrData, null, 2));
              
              // Check for base64 QR
              if (qrData.base64) {
                qrCodeBase64 = qrData.base64.startsWith("data:") 
                  ? qrData.base64 
                  : `data:image/png;base64,${qrData.base64}`;
                console.log("[Evolution Instance] Got QR from connect endpoint");
                break;
              }
              
              // If we have the QR string code, generate image
              if (qrData.code) {
                console.log("[Evolution Instance] Generating QR from code string:", qrData.code.substring(0, 50) + "...");
                try {
                  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData.code)}`;
                  const qrImageResponse = await fetch(qrApiUrl);
                  
                  if (qrImageResponse.ok) {
                    const arrayBuffer = await qrImageResponse.arrayBuffer();
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                    qrCodeBase64 = `data:image/png;base64,${base64}`;
                    console.log("[Evolution Instance] QR code generated from code string");
                    break;
                  }
                } catch (e) {
                  console.error("[Evolution Instance] Failed to generate QR from string:", e);
                }
              }
              
              // If we have pairing code, we can use that as fallback
              if (qrData.pairingCode) {
                console.log("[Evolution Instance] Pairing code available:", qrData.pairingCode);
              }
            } catch (e) {
              console.error(`[Evolution Instance] Connect attempt ${attempt + 1} failed:`, e);
            }
            
            // Wait 3 seconds before next retry (increased from 2)
            if (attempt < 4) {
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
        }

        // 7. Update database with new QR code
        await supabaseClient
          .from("connections")
          .update({
            qr_code: qrCodeBase64,
            status: "connecting",
            session_data: { instanceName: instName },
          })
          .eq("id", connectionId);

        console.log("[Evolution Instance] Recreated with QR:", qrCodeBase64 ? "Yes" : "No");

        return new Response(
          JSON.stringify({
            success: true,
            qrCode: qrCodeBase64,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "diagnose": {
        // Diagnostic action to check Evolution API status
        const instName = await getInstanceName(supabaseClient, connectionId);
        const diagnostics: Record<string, unknown> = { instanceName: instName || "NOT_FOUND" };

        // 1. Check API connectivity
        try {
          const pingResponse = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
            method: "GET",
            headers: evolutionHeaders,
          });
          diagnostics.apiReachable = pingResponse.ok;
          diagnostics.fetchInstances = await pingResponse.json();
        } catch (e) {
          diagnostics.apiReachable = false;
          diagnostics.fetchInstancesError = String(e);
        }

        // 2. Check connection state
        if (instName) {
          try {
            const stateResponse = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instName}`, {
              method: "GET",
              headers: evolutionHeaders,
            });
            diagnostics.instanceExists = stateResponse.ok;
            diagnostics.connectionState = await stateResponse.json();
          } catch (e) {
            diagnostics.instanceExists = false;
            diagnostics.connectionStateError = String(e);
          }

          // 3. Try to get QR
          try {
            const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instName}`, {
              method: "GET",
              headers: evolutionHeaders,
            });
            diagnostics.connectResponse = await qrResponse.json();
          } catch (e) {
            diagnostics.connectError = String(e);
          }
        }

        console.log("[Evolution Instance] Diagnostics:", JSON.stringify(diagnostics, null, 2));

        return new Response(
          JSON.stringify({
            success: true,
            diagnostics,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "serverHealth": {
        // Check Evolution API server health and configuration
        const health: Record<string, unknown> = {
          apiUrl: EVOLUTION_API_URL,
          hasApiKey: !!EVOLUTION_API_KEY,
          timestamp: new Date().toISOString(),
        };

        try {
          const response = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
            method: "GET",
            headers: evolutionHeaders,
          });
          health.apiReachable = response.ok;
          health.statusCode = response.status;
          
          if (response.ok) {
            const instances = await response.json();
            health.instanceCount = Array.isArray(instances) ? instances.length : 0;
            health.instances = instances;
          } else {
            const error = await response.text();
            health.error = error;
          }
        } catch (e) {
          health.apiReachable = false;
          health.error = String(e);
        }

        console.log("[Evolution Instance] Server health:", JSON.stringify(health, null, 2));

        return new Response(
          JSON.stringify({
            success: true,
            health,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "cleanupOrphanedInstances": {
        // Get all instances from Evolution API
        const instancesResponse = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
          method: "GET",
          headers: evolutionHeaders,
        });

        const apiInstances = await instancesResponse.json();
        console.log("[Evolution Instance] API instances:", JSON.stringify(apiInstances));

        // Get all connections from database
        const { data: dbConnections } = await supabaseClient
          .from("connections")
          .select("session_data, name");

        const dbInstanceNames = new Set(
          dbConnections?.map(c => c.session_data?.instanceName || c.name).filter(Boolean) || []
        );

        const deleted: string[] = [];
        const errors: string[] = [];

        // Delete instances that exist in API but not in DB
        for (const instance of (Array.isArray(apiInstances) ? apiInstances : [])) {
          const name = instance.name || instance.instanceName;
          if (name && !dbInstanceNames.has(name)) {
            console.log(`[Evolution Instance] Deleting orphaned instance: ${name}`);
            try {
              const deleteResponse = await fetch(`${EVOLUTION_API_URL}/instance/delete/${name}`, {
                method: "DELETE",
                headers: evolutionHeaders,
              });
              if (deleteResponse.ok) {
                deleted.push(name);
              } else {
                errors.push(`Failed to delete ${name}: ${deleteResponse.status}`);
              }
            } catch (e) {
              errors.push(`Error deleting ${name}: ${e}`);
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            deleted,
            errors,
            apiInstanceCount: Array.isArray(apiInstances) ? apiInstances.length : 0,
            dbConnectionCount: dbInstanceNames.size,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: unknown) {
    console.error("Evolution instance error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
