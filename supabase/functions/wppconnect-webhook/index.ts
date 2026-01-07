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
  sessionName: string,
  messageId: string,
  mediaType: 'audio' | 'image' | 'video' | 'document',
  base64Data?: string,
  mimetype?: string,
  fileName?: string
): Promise<string | null> {
  try {
    console.log(`[Webhook] Processing media: ${mediaType} for message ${messageId}`);

    if (!base64Data) {
      console.log("[Webhook] No base64 data provided");
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine file extension and mime type
    let extension = 'bin';
    let mimeType = mimetype || 'application/octet-stream';

    if (mediaType === 'audio') {
      extension = 'ogg';
      if (mimetype?.includes('mp4') || mimetype?.includes('m4a')) {
        extension = 'm4a';
      } else if (mimetype?.includes('mp3') || mimetype?.includes('mpeg')) {
        extension = 'mp3';
      }
    } else if (mediaType === 'image') {
      extension = 'jpg';
      if (mimetype?.includes('png')) extension = 'png';
      else if (mimetype?.includes('webp')) extension = 'webp';
    } else if (mediaType === 'video') {
      extension = 'mp4';
    } else if (mediaType === 'document' && fileName) {
      const parts = fileName.split('.');
      if (parts.length > 1) extension = parts[parts.length - 1];
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const finalFileName = fileName
      ? `${timestamp}-${randomSuffix}-${fileName}`
      : `${timestamp}-${randomSuffix}.${extension}`;

    const filePath = `${mediaType}/${finalFileName}`;

    // Convert base64 to Uint8Array
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, bytes, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('[Webhook] Storage upload error:', uploadError);
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath);

    console.log(`[Webhook] Media uploaded successfully: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('[Webhook] Error processing media:', error);
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
    console.log("[Webhook] ====== WPPCONNECT EVENT RECEIVED ======");
    console.log("[Webhook] Event:", webhook.event || webhook.type);
    console.log("[Webhook] Session:", webhook.session || webhook.sessionName);
    console.log("[Webhook] Full payload:", JSON.stringify(webhook, null, 2));

    const event = webhook.event || webhook.type || "";
    const session = webhook.session || webhook.sessionName;
    const data = webhook.data || webhook;

    // Skip if no session name
    if (!session) {
      console.log("[Webhook] No session name in payload, ignoring");
      return new Response(JSON.stringify({ success: true, message: "No session" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find connection by session name
    const { data: connection } = await supabaseClient
      .from("connections")
      .select("*")
      .eq("session_data->>sessionName", session)
      .single();

    let conn = connection;
    if (!conn) {
      const { data: connByName } = await supabaseClient
        .from("connections")
        .select("*")
        .eq("name", session)
        .single();
      conn = connByName;
    }

    if (!conn) {
      console.log(`[Webhook] Connection not found for session: ${session} (orphaned, ignoring)`);
      return new Response(JSON.stringify({ success: true, message: "Orphaned session" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Webhook] Found connection: ${conn.id} (${conn.name})`);

    // Handle different event types
    const eventLower = event.toLowerCase();

    // Connection status events
    if (eventLower.includes("status") || eventLower.includes("connection") || eventLower.includes("state")) {
      const state = data.status || data.state || data.connection;
      console.log(`[Webhook] Connection state: ${state}`);

      let status = "disconnected";
      if (state === "CONNECTED" || state === "open" || state === "inChat" || state === true) {
        status = "connected";
      } else if (state === "QRCODE" || state === "qrcode" || state === "CONNECTING" || state === "connecting") {
        status = "connecting";
      }

      await supabaseClient
        .from("connections")
        .update({
          status,
          phone_number: data.wid?.split("@")[0] || data.phone || conn.phone_number,
          qr_code: status === "connected" ? null : conn.qr_code,
        })
        .eq("id", conn.id);

      console.log(`[Webhook] Connection ${conn.id} status updated to: ${status}`);
    }

    // QR Code events
    if (eventLower.includes("qr") || eventLower.includes("qrcode")) {
      let qrBase64 = data.qrcode || data.base64 || data.qr;

      if (qrBase64 && typeof qrBase64 === 'string') {
        if (!qrBase64.startsWith("data:")) {
          qrBase64 = `data:image/png;base64,${qrBase64}`;
        }

        await supabaseClient
          .from("connections")
          .update({
            qr_code: qrBase64,
            status: "connecting",
          })
          .eq("id", conn.id);

        console.log(`[Webhook] QR Code updated for connection ${conn.id}`);
      }
    }

    // Message events
    if (eventLower.includes("message") || eventLower === "onmessage") {
      const messageData = data.message || data;
      const fromMe = messageData.fromMe || messageData.from_me || false;
      
      // Get phone/contact info - WPPConnect uses different field names
      const from = messageData.from || messageData.chatId || messageData.sender?.id || "";
      const to = messageData.to || "";
      
      // Determine the remote contact (not us)
      const remoteId = fromMe ? to : from;
      
      // Ignore group messages
      if (remoteId.includes('@g.us') || remoteId.includes('@broadcast')) {
        console.log(`[Webhook] Ignoring group/broadcast message: ${remoteId}`);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract phone number - WPPConnect format: 5511999999999@c.us or LID format
      let phoneNumber = remoteId
        .replace('@c.us', '')
        .replace('@s.whatsapp.net', '')
        .replace('@lid', '')
        .split(':')[0];

      const isLid = remoteId.includes('@lid') || phoneNumber.length > 15;
      const whatsappLid = isLid ? phoneNumber : null;

      // Try to get real phone from WPPConnect's LID resolution
      let realPhone: string | null = null;
      if (isLid && messageData.sender?.pushname) {
        // WPPConnect might provide the real number in some fields
        const senderNumber = messageData.sender?.verifiedName || 
                            messageData.sender?.shortName ||
                            messageData.notifyName;
        if (senderNumber && /^\d{10,15}$/.test(senderNumber)) {
          realPhone = senderNumber;
        }
      }

      const finalPhoneNumber = realPhone || (isLid ? null : phoneNumber);
      const pushName = messageData.sender?.pushname || messageData.notifyName || messageData.pushName;

      if (!finalPhoneNumber && !whatsappLid) {
        console.log("[Webhook] Could not extract contact info from message");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[Webhook] Message - Phone: ${finalPhoneNumber}, LID: ${whatsappLid}, isLID: ${isLid}`);

      // Get message content
      let messageContent = messageData.body || messageData.content || messageData.caption || "";
      let messageType: "text" | "image" | "audio" | "document" | "video" = "text";
      let mediaUrl: string | null = null;

      // Detect message type
      const msgType = messageData.type || messageData.mimetype || "";
      
      if (msgType.includes('image') || messageData.isMedia && msgType.includes('image')) {
        messageType = "image";
        messageContent = messageContent || "[Imagem]";
        if (messageData.body && messageData.mimetype?.includes('image')) {
          mediaUrl = await downloadAndStoreMedia(
            supabaseUrl, supabaseServiceKey, session, messageData.id,
            'image', messageData.body, messageData.mimetype
          );
        }
      } else if (msgType.includes('audio') || msgType.includes('ptt')) {
        messageType = "audio";
        messageContent = "[Áudio]";
        if (messageData.body) {
          mediaUrl = await downloadAndStoreMedia(
            supabaseUrl, supabaseServiceKey, session, messageData.id,
            'audio', messageData.body, messageData.mimetype
          );
        }
      } else if (msgType.includes('video')) {
        messageType = "video";
        messageContent = messageContent || "[Vídeo]";
        if (messageData.body && messageData.mimetype?.includes('video')) {
          mediaUrl = await downloadAndStoreMedia(
            supabaseUrl, supabaseServiceKey, session, messageData.id,
            'video', messageData.body, messageData.mimetype
          );
        }
      } else if (msgType.includes('document') || messageData.isDocument) {
        messageType = "document";
        const fileName = messageData.filename || messageData.fileName || "arquivo";
        messageContent = messageContent || `[Documento: ${fileName}]`;
        if (messageData.body) {
          mediaUrl = await downloadAndStoreMedia(
            supabaseUrl, supabaseServiceKey, session, messageData.id,
            'document', messageData.body, messageData.mimetype, fileName
          );
        }
      } else if (msgType.includes('sticker')) {
        messageType = "image";
        messageContent = "[Sticker]";
      }

      if (!messageContent) {
        messageContent = "[Mídia]";
      }

      // Contact name
      let contactName: string;
      if (!fromMe && pushName) {
        contactName = pushName;
      } else if (finalPhoneNumber) {
        const formatted = finalPhoneNumber.replace(/^55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        contactName = formatted || "Contato WhatsApp";
      } else {
        contactName = "Contato WhatsApp";
      }

      // Find or create contact
      let contact;
      
      // First try to find by phone
      if (finalPhoneNumber) {
        const { data: existingByPhone } = await supabaseClient
          .from("contacts")
          .select("*")
          .eq("phone", finalPhoneNumber)
          .maybeSingle();
        contact = existingByPhone;
      }

      // Then try to find by LID
      if (!contact && whatsappLid) {
        const { data: existingByLid } = await supabaseClient
          .from("contacts")
          .select("*")
          .eq("whatsapp_lid", whatsappLid)
          .maybeSingle();
        contact = existingByLid;
      }

      // Create new contact if not found
      if (!contact) {
        const { data: newContact, error: createError } = await supabaseClient
          .from("contacts")
          .insert({
            name: contactName,
            phone: finalPhoneNumber,
            whatsapp_lid: whatsappLid,
            status: "active",
          })
          .select()
          .single();

        if (createError) {
          console.error("[Webhook] Error creating contact:", createError);
          // Try to find existing contact one more time
          const { data: retry } = await supabaseClient
            .from("contacts")
            .select("*")
            .or(`phone.eq.${finalPhoneNumber || 'null'},whatsapp_lid.eq.${whatsappLid || 'null'}`)
            .maybeSingle();
          contact = retry;
        } else {
          contact = newContact;
          console.log(`[Webhook] Created new contact: ${contact.id}`);
        }
      } else {
        // Update contact with any new info
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        
        if (finalPhoneNumber && !contact.phone) {
          updates.phone = finalPhoneNumber;
        }
        if (whatsappLid && !contact.whatsapp_lid) {
          updates.whatsapp_lid = whatsappLid;
        }
        if (pushName && !fromMe && (contact.name === "Contato WhatsApp" || contact.name?.match(/^\(\d{2}\)/))) {
          updates.name = pushName;
        }

        if (Object.keys(updates).length > 1) {
          await supabaseClient
            .from("contacts")
            .update(updates)
            .eq("id", contact.id);
        }
      }

      if (!contact) {
        console.error("[Webhook] Failed to get or create contact");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find or create conversation
      const { data: existingConv } = await supabaseClient
        .from("conversations")
        .select("*")
        .eq("contact_id", contact.id)
        .eq("connection_id", conn.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let conversation = existingConv;

      if (!conversation) {
        const { data: newConv, error: convError } = await supabaseClient
          .from("conversations")
          .insert({
            contact_id: contact.id,
            connection_id: conn.id,
            channel: "whatsapp",
            status: "new",
            last_message_at: new Date().toISOString(),
            unread_count: fromMe ? 0 : 1,
          })
          .select()
          .single();

        if (convError) {
          console.error("[Webhook] Error creating conversation:", convError);
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        conversation = newConv;
        console.log(`[Webhook] Created new conversation: ${conversation.id}`);
      }

      // Save message
      const { error: msgError } = await supabaseClient
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          content: messageContent,
          message_type: messageType,
          media_url: mediaUrl,
          sender_id: fromMe ? null : contact.id,
          sender_type: fromMe ? "agent" : "contact",
          is_read: fromMe,
        });

      if (msgError) {
        console.error("[Webhook] Error saving message:", msgError);
      } else {
        console.log(`[Webhook] Message saved to conversation ${conversation.id}`);
      }

      // Update conversation
      await supabaseClient
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: fromMe ? conversation.unread_count : (conversation.unread_count || 0) + 1,
          status: conversation.status === "archived" ? "new" : conversation.status,
        })
        .eq("id", conversation.id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
