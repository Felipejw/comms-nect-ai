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

    // Skip if no instance name
    if (!instance) {
      console.log("[Webhook] No instance name in payload, ignoring");
      return new Response(JSON.stringify({ success: true, message: "No instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find connection by instance name
    const { data: connection } = await supabaseClient
      .from("connections")
      .select("*")
      .eq("session_data->>instanceName", instance)
      .single();

    // Also try matching by name if session_data doesn't match
    let conn = connection;
    if (!conn) {
      const { data: connByName } = await supabaseClient
        .from("connections")
        .select("*")
        .eq("name", instance)
        .single();
      conn = connByName;
    }

    if (!conn) {
      // Silently ignore events for orphaned instances (not in our DB)
      console.log(`[Webhook] Connection not found for instance: ${instance} (orphaned, ignoring)`);
      return new Response(JSON.stringify({ success: true, message: "Orphaned instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log(`[Webhook] Found connection: ${conn.id} (${conn.name})`);
    console.log(`[Webhook] Current status: ${conn.status}, has QR: ${!!conn.qr_code}`);
    

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
            phone_number: data?.instance?.wuid?.split("@")[0] || conn.phone_number,
            qr_code: status === "connected" ? null : conn.qr_code,
          })
          .eq("id", conn.id);

        console.log(`Connection ${conn.id} status updated to: ${status}`);
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
            .eq("id", conn.id);

          console.log(`[Webhook] QR Code updated for connection ${conn.id}, length: ${qrBase64.length}`);
        } else {
          console.log(`[Webhook] QR Code event received but no valid base64 found. Data type: ${typeof qrBase64}`);
        }
        break;
      }

      case "messages.upsert": {
        // New message received or sent
        const remoteJid = data?.key?.remoteJid;
        const fromMe = data?.key?.fromMe || false;
        
        // Ignore group messages and broadcasts - only process direct messages
        if (remoteJid?.includes('@g.us') || remoteJid?.includes('@broadcast')) {
          console.log(`[Webhook] Ignoring group/broadcast message: ${remoteJid}`);
          break;
        }

        // Extract phone number from remoteJid
        // Handle formats: 5511999999999@s.whatsapp.net, 64081549635686@lid, 64081549635686:25@lid
        let phoneNumber = remoteJid
          ?.replace('@s.whatsapp.net', '')
          ?.replace('@lid', '')
          ?.split(':')[0];

        if (!phoneNumber) {
          console.log("[Webhook] Could not extract phone number from remoteJid:", remoteJid);
          break;
        }

        // Get message content - handle different message types
        const message = data?.message || {};
        let messageContent = 
          message.conversation ||
          message.extendedTextMessage?.text ||
          message.imageMessage?.caption ||
          message.videoMessage?.caption ||
          message.documentMessage?.caption ||
          message.audioMessage?.caption ||
          null;
        
        // Determine message type
        let messageType: "text" | "image" | "audio" | "document" = "text";
        let mediaUrl: string | null = null;
        
        if (message.imageMessage) {
          messageType = "image";
          mediaUrl = message.imageMessage.url || null;
          messageContent = messageContent || "[Imagem]";
        } else if (message.audioMessage) {
          messageType = "audio";
          mediaUrl = message.audioMessage.url || null;
          messageContent = messageContent || "[Áudio]";
        } else if (message.documentMessage) {
          messageType = "document";
          mediaUrl = message.documentMessage.url || null;
          messageContent = messageContent || `[Documento: ${message.documentMessage.fileName || 'arquivo'}]`;
        } else if (message.videoMessage) {
          messageType = "image"; // Using image type for video since it's not in the enum
          mediaUrl = message.videoMessage.url || null;
          messageContent = messageContent || "[Vídeo]";
        } else if (message.stickerMessage) {
          messageType = "image";
          mediaUrl = message.stickerMessage.url || null;
          messageContent = messageContent || "[Sticker]";
        }

        // If no content at all, use fallback
        if (!messageContent) {
          messageContent = "[Mídia]";
        }

        // Get contact name with fallback
        const contactName = data?.pushName || phoneNumber || "Contato Desconhecido";

        console.log(`[Webhook] Message ${fromMe ? 'SENT' : 'RECEIVED'} - Phone: ${phoneNumber}, Content: ${messageContent.substring(0, 50)}`);

        // Find or create contact
        let contact;
        const { data: existingContact } = await supabaseClient
          .from("contacts")
          .select("*")
          .eq("phone", phoneNumber)
          .single();

        if (existingContact) {
          contact = existingContact;
          
          // Update contact name if we have a better one (pushName) and current is just the phone
          if (data?.pushName && existingContact.name === existingContact.phone) {
            await supabaseClient
              .from("contacts")
              .update({ name: data.pushName })
              .eq("id", existingContact.id);
            console.log(`[Webhook] Updated contact name to: ${data.pushName}`);
          }
        } else {
          const { data: newContact, error: contactError } = await supabaseClient
            .from("contacts")
            .insert({
              name: contactName,
              phone: phoneNumber,
              status: "active",
            })
            .select()
            .single();

          if (contactError) {
            console.error("[Webhook] Error creating contact:", contactError);
            throw contactError;
          }
          contact = newContact;
          console.log(`[Webhook] New contact created: ${contact.id} (${contactName})`);
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
          
          // Update last_message_at
          await supabaseClient
            .from("conversations")
            .update({ 
              last_message_at: new Date().toISOString(),
              unread_count: fromMe ? existingConversation.unread_count : (existingConversation.unread_count || 0) + 1
            })
            .eq("id", existingConversation.id);
        } else {
          const { data: newConversation, error: convError } = await supabaseClient
            .from("conversations")
            .insert({
              contact_id: contact.id,
              channel: "whatsapp",
              status: "new",
              subject: messageContent.substring(0, 50),
              unread_count: fromMe ? 0 : 1,
            })
            .select()
            .single();

          if (convError) {
            console.error("[Webhook] Error creating conversation:", convError);
            throw convError;
          }
          conversation = newConversation;
          console.log(`[Webhook] New conversation created: ${conversation.id}`);
        }

        // Create message
        // sender_type: 'contact' for received, 'user' for sent by us
        const { error: msgError } = await supabaseClient
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            content: messageContent,
            sender_type: fromMe ? "user" : "contact",
            message_type: messageType,
            media_url: mediaUrl,
          });

        if (msgError) {
          console.error("[Webhook] Error creating message:", msgError);
          throw msgError;
        }

        console.log(`[Webhook] Message saved for conversation ${conversation.id} (type: ${messageType}, fromMe: ${fromMe})`);
        break;
      }

      case "messages.update": {
        // Message status update (delivered, read, etc.)
        console.log("[Webhook] Message status update:", data);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[Webhook] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
