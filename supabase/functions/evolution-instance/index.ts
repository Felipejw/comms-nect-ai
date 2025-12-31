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
        // Create instance in Evolution API
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

        // Save connection to database
        const { data: connection, error: dbError } = await supabaseClient
          .from("connections")
          .insert({
            name: instanceName,
            type: "whatsapp",
            status: "qr_code",
            session_data: { instanceName },
          })
          .select()
          .single();

        if (dbError) {
          console.error("Database error:", dbError);
          throw dbError;
        }

        // Get QR Code
        const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
          method: "GET",
          headers: evolutionHeaders,
        });

        const qrData = await qrResponse.json();
        console.log("QR Code response:", JSON.stringify(qrData));

        // Update connection with QR code
        if (qrData.base64) {
          await supabaseClient
            .from("connections")
            .update({ qr_code: qrData.base64 })
            .eq("id", connection.id);
        }

        return new Response(
          JSON.stringify({
            success: true,
            connection,
            qrCode: qrData.base64 || qrData.code,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getQrCode": {
        // Fetch QR Code for existing instance
        const { data: conn } = await supabaseClient
          .from("connections")
          .select("session_data")
          .eq("id", connectionId)
          .single();

        const instName = conn?.session_data?.instanceName || instanceName;

        const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instName}`, {
          method: "GET",
          headers: evolutionHeaders,
        });

        const qrData = await qrResponse.json();
        console.log("Get QR response:", JSON.stringify(qrData));

        // Update QR code in database
        if (qrData.base64) {
          await supabaseClient
            .from("connections")
            .update({ qr_code: qrData.base64 })
            .eq("id", connectionId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            qrCode: qrData.base64 || qrData.code,
            pairingCode: qrData.pairingCode,
          }),
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
        console.log("Status response:", JSON.stringify(statusData));

        const isConnected = statusData.instance?.state === "open";
        const newStatus = isConnected ? "connected" : statusData.instance?.state === "close" ? "disconnected" : "qr_code";

        // Update status in database
        await supabaseClient
          .from("connections")
          .update({ 
            status: newStatus,
            qr_code: isConnected ? null : undefined 
          })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({
            success: true,
            status: newStatus,
            state: statusData.instance?.state,
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
