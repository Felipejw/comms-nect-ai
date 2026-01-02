import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to download and store media
async function downloadAndStoreMedia(
  supabaseUrl: string,
  supabaseKey: string,
  instanceName: string,
  messageKey: { remoteJid: string; fromMe: boolean; id: string },
  mediaType: 'audio' | 'image' | 'video' | 'document',
  fileName?: string
): Promise<string | null> {
  try {
    console.log(`[Webhook] Downloading media: ${mediaType} for message ${messageKey.id}`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/download-whatsapp-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        instanceName,
        messageKey,
        mediaType,
        fileName
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Webhook] Failed to download media: ${response.status}`, errorText);
      return null;
    }

    const result = await response.json();
    if (result.success && result.url) {
      console.log(`[Webhook] Media downloaded successfully: ${result.url}`);
      return result.url;
    }

    console.error('[Webhook] Media download returned no URL:', result);
    return null;
  } catch (error) {
    console.error('[Webhook] Error downloading media:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

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

        // Detect if this is a LID (Link ID) instead of a real phone number
        const isLid = remoteJid?.includes('@lid');
        
        // Extract phone number from remoteJid
        // Handle formats: 5511999999999@s.whatsapp.net, 64081549635686@lid, 64081549635686:25@lid
        let phoneNumber = remoteJid
          ?.replace('@s.whatsapp.net', '')
          ?.replace('@lid', '')
          ?.split(':')[0];

        // Store the original LID for reference
        const whatsappLid = isLid ? remoteJid?.replace('@lid', '')?.split(':')[0] : null;

        if (!phoneNumber) {
          console.log("[Webhook] Could not extract phone number from remoteJid:", remoteJid);
          break;
        }

        console.log(`[Webhook] Processing message - Phone: ${phoneNumber}, isLID: ${isLid}, LID: ${whatsappLid}`);

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
        
        // Determine message type and prepare for media download
        let messageType: "text" | "image" | "audio" | "document" | "video" = "text";
        let mediaUrl: string | null = null;
        let needsMediaDownload = false;
        let mediaFileName: string | undefined;
        
        if (message.imageMessage) {
          messageType = "image";
          needsMediaDownload = true;
          messageContent = messageContent || "[Imagem]";
        } else if (message.audioMessage) {
          messageType = "audio";
          needsMediaDownload = true;
          messageContent = messageContent || "[Áudio]";
        } else if (message.documentMessage) {
          messageType = "document";
          needsMediaDownload = true;
          mediaFileName = message.documentMessage.fileName;
          messageContent = messageContent || `[Documento: ${message.documentMessage.fileName || 'arquivo'}]`;
        } else if (message.videoMessage) {
          messageType = "video";
          needsMediaDownload = true;
          messageContent = messageContent || "[Vídeo]";
        } else if (message.stickerMessage) {
          messageType = "image";
          needsMediaDownload = true;
          messageContent = messageContent || "[Sticker]";
        }

        // Download media if needed (only for received messages, not sent by us)
        if (needsMediaDownload && !fromMe) {
          const messageKey = {
            remoteJid: data?.key?.remoteJid,
            fromMe: data?.key?.fromMe,
            id: data?.key?.id
          };
          
          mediaUrl = await downloadAndStoreMedia(
            supabaseUrl,
            supabaseServiceKey,
            instance,
            messageKey,
            messageType === 'video' ? 'video' : messageType as 'audio' | 'image' | 'document',
            mediaFileName
          );
        }

        // If no content at all, use fallback
        if (!messageContent) {
          messageContent = "[Mídia]";
        }

        // Get contact name with fallback
        const contactName = data?.pushName || phoneNumber || "Contato Desconhecido";
        
        // Tentar extrair foto do perfil do WhatsApp (pode estar em diferentes locais)
        const profilePictureUrl = data?.profilePictureUrl || data?.pushName?.profilePictureUrl || null;

        console.log(`[Webhook] Message ${fromMe ? 'SENT' : 'RECEIVED'} - Phone: ${phoneNumber}, Content: ${messageContent.substring(0, 50)}`);

        // Find or create contact - check by phone OR by LID
        let contact;
        
        // First try to find by LID if we have one
        if (whatsappLid) {
          const { data: contactByLid } = await supabaseClient
            .from("contacts")
            .select("*")
            .eq("whatsapp_lid", whatsappLid)
            .single();
          
          if (contactByLid) {
            contact = contactByLid;
            console.log(`[Webhook] Found contact by LID: ${contact.id}`);
          }
        }
        
        // If not found by LID, try by phone
        if (!contact) {
          const { data: existingContact } = await supabaseClient
            .from("contacts")
            .select("*")
            .eq("phone", phoneNumber)
            .single();
          
          contact = existingContact;
        }

        if (contact) {
          // Preparar atualizações para o contato
          const updates: Record<string, string | null> = {};
          
          // Update contact name if we have a better one (pushName) and current is just the phone or LID-like
          if (data?.pushName && (contact.name === contact.phone || contact.name?.match(/^\d{15,}$/))) {
            updates.name = data.pushName;
          }
          
          // Atualizar foto de perfil se disponível e contato não tem foto
          if (profilePictureUrl && !contact.avatar_url) {
            updates.avatar_url = profilePictureUrl;
          }
          
          // Store the LID if we have it and contact doesn't have one
          if (whatsappLid && !contact.whatsapp_lid) {
            updates.whatsapp_lid = whatsappLid;
          }
          
          // Aplicar atualizações se houver
          if (Object.keys(updates).length > 0) {
            await supabaseClient
              .from("contacts")
              .update(updates)
              .eq("id", contact.id);
            console.log(`[Webhook] Updated contact: ${JSON.stringify(updates)}`);
          }
        } else {
          // Create new contact
          const { data: newContact, error: contactError } = await supabaseClient
            .from("contacts")
            .insert({
              name: contactName,
              phone: phoneNumber,
              avatar_url: profilePictureUrl,
              whatsapp_lid: whatsappLid,
              status: "active",
            })
            .select()
            .single();

          if (contactError) {
            console.error("[Webhook] Error creating contact:", contactError);
            throw contactError;
          }
          contact = newContact;
          console.log(`[Webhook] New contact created: ${contact.id} (${contactName}), LID: ${whatsappLid}`);
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
        // sender_type: 'contact' for received, 'agent' for sent by us
        const { error: msgError } = await supabaseClient
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            content: messageContent,
            sender_type: fromMe ? "agent" : "contact",
            message_type: messageType,
            media_url: mediaUrl,
          });

        if (msgError) {
          console.error("[Webhook] Error creating message:", msgError);
          throw msgError;
        }

        console.log(`[Webhook] Message saved for conversation ${conversation.id} (type: ${messageType}, mediaUrl: ${mediaUrl}, fromMe: ${fromMe})`);
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
