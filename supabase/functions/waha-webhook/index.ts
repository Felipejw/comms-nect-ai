import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// Download and store media
async function downloadAndStoreMedia(
  supabaseUrl: string,
  supabaseKey: string,
  sessionName: string,
  messageId: string,
  mediaType: "audio" | "image" | "video" | "document",
  mediaUrl?: string,
  mimetype?: string,
  fileName?: string
): Promise<string | null> {
  if (!mediaUrl) return null;

  try {
    console.log(`[WAHA Webhook] Downloading media: ${mediaUrl}`);

    const response = await fetch(mediaUrl);
    if (!response.ok) {
      console.error("[WAHA Webhook] Failed to download media:", response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Determine file extension
    let extension = "bin";
    if (mimetype) {
      const parts = mimetype.split("/");
      extension = parts[1] || "bin";
    } else if (fileName) {
      const parts = fileName.split(".");
      extension = parts[parts.length - 1] || "bin";
    }

    const storagePath = `${sessionName}/${messageId}.${extension}`;

    const supabaseClient = createClient(supabaseUrl, supabaseKey);
    const { error: uploadError } = await supabaseClient.storage
      .from("whatsapp-media")
      .upload(storagePath, uint8Array, {
        contentType: mimetype || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      console.error("[WAHA Webhook] Error uploading media:", uploadError);
      return null;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from("whatsapp-media")
      .getPublicUrl(storagePath);

    console.log("[WAHA Webhook] Media stored:", publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error("[WAHA Webhook] Error processing media:", error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log("[WAHA Webhook] Received event:", JSON.stringify(payload));

    const { event, session, payload: eventPayload } = payload;

    if (!session) {
      console.log("[WAHA Webhook] No session in payload, ignoring");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find connection by session name
    const { data: connections } = await supabaseClient
      .from("connections")
      .select("*")
      .eq("type", "whatsapp")
      .or(`name.ilike.%${session}%,session_data->>sessionName.eq.${session}`);

    const connection = connections?.find(c => {
      const sessionData = c.session_data as { sessionName?: string } | null;
      return sessionData?.sessionName === session || 
             c.name.toLowerCase().replace(/\s+/g, "_") === session;
    });

    if (!connection) {
      console.log(`[WAHA Webhook] Connection not found for session: ${session}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[WAHA Webhook] Found connection: ${connection.id} (${connection.name})`);

    // Handle session status events
    if (event === "session.status") {
      const status = mapWAHAStatus(eventPayload?.status || "STOPPED");
      console.log(`[WAHA Webhook] Session ${session} status changed to: ${status}`);

      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === "connected") {
        updates.qr_code = null;
        // Try to get phone number
        if (eventPayload?.me?.id) {
          updates.phone_number = eventPayload.me.id.replace("@c.us", "");
        }
      }

      await supabaseClient
        .from("connections")
        .update(updates)
        .eq("id", connection.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle message events
    if (event === "message") {
      const msg = eventPayload;
      
      if (!msg) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Skip outgoing messages (from me)
      if (msg.fromMe) {
        console.log("[WAHA Webhook] Skipping outgoing message");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const from = msg.from?.replace("@c.us", "") || msg.chatId?.replace("@c.us", "");
      const body = msg.body || msg.text || "";
      const messageId = msg.id || `waha_${Date.now()}`;
      const timestamp = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();

      console.log(`[WAHA Webhook] Message from: ${from}, body: ${body?.substring(0, 50)}`);

      // Determine message type and handle media
      let messageType = "text";
      let mediaUrl: string | null = null;

      if (msg.hasMedia || msg.mediaUrl) {
        if (msg.type === "image" || msg.mimetype?.startsWith("image")) {
          messageType = "image";
        } else if (msg.type === "audio" || msg.type === "ptt" || msg.mimetype?.startsWith("audio")) {
          messageType = "audio";
        } else if (msg.type === "video" || msg.mimetype?.startsWith("video")) {
          messageType = "video";
        } else {
          messageType = "document";
        }

        mediaUrl = await downloadAndStoreMedia(
          supabaseUrl,
          supabaseKey,
          session,
          messageId,
          messageType as "audio" | "image" | "video" | "document",
          msg.mediaUrl,
          msg.mimetype,
          msg.filename
        );
      }

      // Find or create contact
      let contact;
      const { data: existingContact } = await supabaseClient
        .from("contacts")
        .select("*")
        .eq("phone", from)
        .maybeSingle();

      if (existingContact) {
        contact = existingContact;
        // Update name if we have a better one
        if (msg.pushName && (!contact.name || contact.name === from || contact.name === "Contato Desconhecido")) {
          await supabaseClient
            .from("contacts")
            .update({ name: msg.pushName, updated_at: new Date().toISOString() })
            .eq("id", contact.id);
        }
      } else {
        const { data: newContact, error: contactError } = await supabaseClient
          .from("contacts")
          .insert({
            phone: from,
            name: msg.pushName || from,
            tenant_id: connection.tenant_id,
          })
          .select()
          .single();

        if (contactError) {
          console.error("[WAHA Webhook] Error creating contact:", contactError);
          return new Response(JSON.stringify({ success: false, error: contactError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        contact = newContact;
      }

      // Find or create conversation
      let conversation;
      const { data: existingConversation } = await supabaseClient
        .from("conversations")
        .select("*")
        .eq("contact_id", contact.id)
        .eq("connection_id", connection.id)
        .maybeSingle();

      if (existingConversation) {
        conversation = existingConversation;
        await supabaseClient
          .from("conversations")
          .update({
            last_message_at: timestamp.toISOString(),
            status: existingConversation.status === "closed" ? "new" : existingConversation.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      } else {
        const { data: newConversation, error: convError } = await supabaseClient
          .from("conversations")
          .insert({
            contact_id: contact.id,
            connection_id: connection.id,
            tenant_id: connection.tenant_id,
            status: "new",
            last_message_at: timestamp.toISOString(),
          })
          .select()
          .single();

        if (convError) {
          console.error("[WAHA Webhook] Error creating conversation:", convError);
          return new Response(JSON.stringify({ success: false, error: convError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        conversation = newConversation;
      }

      // Save message
      const { error: msgError } = await supabaseClient
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          content: body,
          message_type: messageType,
          media_url: mediaUrl,
          sender_type: "contact",
          external_id: messageId,
          is_read: false,
        });

      if (msgError) {
        console.error("[WAHA Webhook] Error saving message:", msgError);
      }

      console.log(`[WAHA Webhook] Message saved for conversation: ${conversation.id}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle other events
    console.log(`[WAHA Webhook] Unhandled event: ${event}`);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[WAHA Webhook] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
