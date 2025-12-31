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
    console.log("Webhook received:", JSON.stringify(webhook));

    const { event, instance, data } = webhook;

    // Find connection by instance name
    const { data: connection } = await supabaseClient
      .from("connections")
      .select("*")
      .eq("session_data->>instanceName", instance)
      .single();

    if (!connection) {
      console.log(`Connection not found for instance: ${instance}`);
      return new Response(JSON.stringify({ success: true, message: "Connection not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (event) {
      case "connection.update": {
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

      case "qrcode.updated": {
        // QR Code updated
        await supabaseClient
          .from("connections")
          .update({ 
            qr_code: data?.qrcode?.base64,
            status: "connecting",
          })
          .eq("id", connection.id);

        console.log(`QR Code updated for connection ${connection.id}`);
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
