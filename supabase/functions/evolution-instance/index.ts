import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

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
        // Create instance in Evolution API with QR code enabled
        const createResponse = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: "POST",
          headers: evolutionHeaders,
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
          }),
        });

        const createData = await createResponse.json();
        console.log("[Evolution Instance] Create response status:", createResponse.status);
        console.log("[Evolution Instance] Create response:", JSON.stringify(createData));

        if (!createResponse.ok) {
          console.error("[Evolution Instance] Create failed:", createData);
          throw new Error(createData.message || createData.error || "Failed to create instance");
        }

        // Extract QR code from create response - Evolution API v2 returns it directly
        let qrCodeBase64 = null;
        if (createData.qrcode?.base64) {
          qrCodeBase64 = createData.qrcode.base64;
        } else if (createData.base64) {
          qrCodeBase64 = createData.base64;
        }
        
        // Ensure QR code has proper data URI prefix
        if (qrCodeBase64 && !qrCodeBase64.startsWith("data:")) {
          qrCodeBase64 = `data:image/png;base64,${qrCodeBase64}`;
        }

        console.log("[Evolution Instance] QR Code from create:", qrCodeBase64 ? "Found" : "Not found");

        // Save connection to database with QR code if available
        const { data: connection, error: dbError } = await supabaseClient
          .from("connections")
          .insert({
            name: instanceName,
            type: "whatsapp",
            status: "connecting",
            qr_code: qrCodeBase64,
            session_data: { instanceName },
          })
          .select()
          .single();

        if (dbError) {
          console.error("Database error:", dbError);
          throw dbError;
        }

        // If no QR from create, try to fetch it via connect endpoint
        if (!qrCodeBase64) {
          console.log("[Evolution Instance] Fetching QR via connect endpoint...");
          const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
            method: "GET",
            headers: evolutionHeaders,
          });

          const qrData = await qrResponse.json();
          console.log("[Evolution Instance] Connect response:", JSON.stringify(qrData));

          if (qrData.base64) {
            qrCodeBase64 = qrData.base64.startsWith("data:") 
              ? qrData.base64 
              : `data:image/png;base64,${qrData.base64}`;
            
            await supabaseClient
              .from("connections")
              .update({ qr_code: qrCodeBase64 })
              .eq("id", connection.id);
          }
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
        // First, restart the instance to force new QR code generation
        const { data: conn } = await supabaseClient
          .from("connections")
          .select("session_data")
          .eq("id", connectionId)
          .single();

        const instName = conn?.session_data?.instanceName || instanceName;

        console.log(`[Evolution Instance] Restarting instance ${instName} to refresh QR...`);

        // Try to restart instance first (this regenerates QR)
        try {
          const restartResponse = await fetch(`${EVOLUTION_API_URL}/instance/restart/${instName}`, {
            method: "PUT",
            headers: evolutionHeaders,
          });
          console.log("[Evolution Instance] Restart response status:", restartResponse.status);
        } catch (e) {
          console.log("[Evolution Instance] Restart failed, trying connect directly:", e);
        }

        // Wait a bit for restart to take effect
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Now fetch the QR code
        const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instName}`, {
          method: "GET",
          headers: evolutionHeaders,
        });

        const qrData = await qrResponse.json();
        console.log("[Evolution Instance] Get QR response:", JSON.stringify(qrData));

        let qrCodeBase64 = null;
        if (qrData.base64) {
          qrCodeBase64 = qrData.base64.startsWith("data:") 
            ? qrData.base64 
            : `data:image/png;base64,${qrData.base64}`;
        } else if (qrData.code) {
          // If only string code is returned, we'll need to generate QR on frontend
          console.log("[Evolution Instance] Only QR code string returned, not base64");
        }

        // Update QR code in database
        if (qrCodeBase64) {
          await supabaseClient
            .from("connections")
            .update({ qr_code: qrCodeBase64, status: "connecting" })
            .eq("id", connectionId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            qrCode: qrCodeBase64,
            qrString: qrData.code,
            pairingCode: qrData.pairingCode,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "restart": {
        // Restart instance to get new QR code
        const { data: conn } = await supabaseClient
          .from("connections")
          .select("session_data")
          .eq("id", connectionId)
          .single();

        const instName = conn?.session_data?.instanceName || instanceName;

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
        // Check connection status
        const { data: conn } = await supabaseClient
          .from("connections")
          .select("session_data")
          .eq("id", connectionId)
          .single();

        const instName = conn?.session_data?.instanceName || instanceName;

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
        // Logout from WhatsApp
        const { data: conn } = await supabaseClient
          .from("connections")
          .select("session_data")
          .eq("id", connectionId)
          .single();

        const instName = conn?.session_data?.instanceName;

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
        // Delete instance completely
        const { data: conn } = await supabaseClient
          .from("connections")
          .select("session_data")
          .eq("id", connectionId)
          .single();

        const instName = conn?.session_data?.instanceName;

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
