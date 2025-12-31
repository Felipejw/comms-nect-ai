import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const webhook = await req.json();
    console.log("[Webhook] ====== EVENT RECEIVED ======");
    console.log("[Webhook] Event:", webhook.event);
    console.log("[Webhook] Instance:", webhook.instance);
    console.log("[Webhook] Full payload:", JSON.stringify(webhook, null, 2));

    const { event, instance, data } = webhook;

    // Find connection by instance name
    const { data: connection } = await supabaseClient
      .from("connections")
      .select("*")
      .eq("session_data->>instanceName", instance)
      .single();

    if (!connection) {
      console.log(`[Webhook] Connection not found for instance: ${instance}`);
      return new Response(JSON.stringify({ success: true, message: "Connection not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log(`[Webhook] Found connection: ${connection.id} (${connection.name})`);
    console.log(`[Webhook] Current status: ${connection.status}, has QR: ${!!connection.qr_code}`);
    

    // Normalize event name to lowercase for comparison
    const eventLower = event?.toLowerCase();
    
    switch (eventLower) {
      case "connection.update":
      case "connection_update": {
        // Connection status changed
        const state = data?.state;
        let status = "disconnected";

        if (state === "open") {
          status = "connected";
        } else if (state === "connecting" || state === "qrcode") {
          status = "connecting";
        }

        await supabaseClient
          .from("connections")
          .update({ 
            status,
            phone_number: data?.instance?.wuid?.split("@")[0] || connection.phone_number,
            qr_code: status === "connected" ? null : connection.qr_code,
          })
          .eq("id", connection.id);

        console.log(`Connection ${connection.id} status updated to: ${status}`);
        break;
      }

      case "qrcode.updated":
      case "qrcode_updated": {
        // QR Code updated - extract base64 from various possible locations
        console.log("[Webhook] Processing QRCODE event...");
        console.log("[Webhook] Data keys:", Object.keys(data || {}));
        console.log("[Webhook] data.qrcode:", data?.qrcode);
        console.log("[Webhook] data.base64:", data?.base64?.substring?.(0, 50));
        
        let qrBase64 = data?.qrcode?.base64 || data?.base64 || data?.qrcode;
        
        // If qrcode is an object, try to extract base64
        if (qrBase64 && typeof qrBase64 === 'object' && qrBase64.base64) {
          qrBase64 = qrBase64.base64;
        }
        
        // Ensure proper data URI prefix
        if (qrBase64 && typeof qrBase64 === 'string' && !qrBase64.startsWith("data:")) {
          qrBase64 = `data:image/png;base64,${qrBase64}`;
        }
        
        if (qrBase64 && typeof qrBase64 === 'string') {
          await supabaseClient
            .from("connections")
            .update({ 
              qr_code: qrBase64,
              status: "connecting",
            })
            .eq("id", connection.id);

          console.log(`[Webhook] QR Code updated for connection ${connection.id}, length: ${qrBase64.length}`);
        } else {
          console.log(`[Webhook] QR Code event received but no valid base64 found. Data type: ${typeof qrBase64}`);
        }
        break;
      }

      case "messages.upsert": {
        // New message received
        const message = data?.message;
        if (!message || message.key?.fromMe) {
          console.log("Ignoring own message or empty message");
          break;
        }

        const remoteJid = message.key?.remoteJid;
        const phoneNumber = remoteJid?.split("@")[0];
        const messageContent = message.message?.conversation || 
                               message.message?.extendedTextMessage?.text ||
                               message.message?.imageMessage?.caption ||
                               "[Mídia]";

        console.log(`Message from ${phoneNumber}: ${messageContent}`);

        // Find or create contact
        let contact;
        const { data: existingContact } = await supabaseClient
          .from("contacts")
          .select("*")
          .eq("phone", phoneNumber)
          .single();

        if (existingContact) {
          contact = existingContact;
        } else {
          const { data: newContact, error: contactError } = await supabaseClient
            .from("contacts")
            .insert({
              name: message.pushName || phoneNumber,
              phone: phoneNumber,
              status: "active",
            })
            .select()
            .single();

          if (contactError) {
            console.error("Error creating contact:", contactError);
            throw contactError;
          }
          contact = newContact;
          console.log(`New contact created: ${contact.id}`);
        }

        // Find or create conversation
        let conversation;
        const { data: existingConversation } = await supabaseClient
          .from("conversations")
          .select("*")
          .eq("contact_id", contact.id)
          .in("status", ["new", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (existingConversation) {
          conversation = existingConversation;
        } else {
          const { data: newConversation, error: convError } = await supabaseClient
            .from("conversations")
            .insert({
              contact_id: contact.id,
              channel: "whatsapp",
              status: "new",
              subject: messageContent.substring(0, 50),
            })
            .select()
            .single();

          if (convError) {
            console.error("Error creating conversation:", convError);
            throw convError;
          }
          conversation = newConversation;
          console.log(`New conversation created: ${conversation.id}`);
        }

        // Create message
        const { error: msgError } = await supabaseClient
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            content: messageContent,
            sender_type: "contact",
            message_type: message.message?.imageMessage ? "image" : "text",
            media_url: message.message?.imageMessage?.url || null,
          });

        if (msgError) {
          console.error("Error creating message:", msgError);
          throw msgError;
        }

        console.log(`Message saved for conversation ${conversation.id}`);
        break;
      }

      case "messages.update": {
        // Message status update (delivered, read, etc.)
        console.log("Message status update:", data);
        break;
      }

      default:
        console.log(`Unhandled event: ${event}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
