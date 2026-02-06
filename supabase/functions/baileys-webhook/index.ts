import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map Baileys status to our system status
function mapBaileysStatus(status: string): string {
  const statusMap: Record<string, string> = {
    STOPPED: "disconnected",
    STARTING: "connecting",
    connecting: "connecting",
    connected: "connected",
    WORKING: "connected",
    FAILED: "disconnected",
    disconnected: "disconnected",
  };
  return statusMap[status] || "disconnected";
}

// Detect if a "from" address is a WhatsApp LID
function parseFromAddress(rawFrom: string): { identifier: string; isLid: boolean } {
  const isLid = rawFrom.endsWith("@lid");
  const identifier = rawFrom
    .replace("@s.whatsapp.net", "")
    .replace("@g.us", "")
    .replace("@lid", "");
  return { identifier, isLid };
}

// Store media from base64
async function storeMediaFromBase64(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  sessionName: string,
  messageId: string,
  base64Data: string
): Promise<string | null> {
  try {
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;

    const mimetype = matches[1];
    const base64 = matches[2];
    const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "audio/ogg": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "application/pdf": "pdf",
    };
    const ext = extMap[mimetype] || mimetype.split("/")[1] || "bin";

    const storagePath = `${sessionName}/${messageId}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("whatsapp-media")
      .upload(storagePath, buffer, {
        contentType: mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Baileys Webhook] Error uploading media:", uploadError);
      return null;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from("whatsapp-media")
      .getPublicUrl(storagePath);

    console.log("[Baileys Webhook] Media stored:", publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error("[Baileys Webhook] Error processing media:", error);
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
    console.log("[Baileys Webhook] ✅ Function called! Event:", payload?.event, "Session:", payload?.session);
    console.log("[Baileys Webhook] Full payload:", JSON.stringify(payload).substring(0, 500));

    const { event, session, payload: eventPayload } = payload;

    if (!session) {
      console.log("[Baileys Webhook] No session in payload, ignoring");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find connection by session name
    const { data: connections } = await supabaseClient
      .from("connections")
      .select("*")
      .eq("type", "whatsapp");

    const connection = connections?.find((c: { session_data: { sessionName?: string; engine?: string } | null }) => {
      const sessionData = c.session_data;
      return sessionData?.sessionName === session && sessionData?.engine === "baileys";
    });

    if (!connection) {
      console.log(`[Baileys Webhook] Connection not found for session: ${session}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Baileys Webhook] Found connection: ${connection.id} (${connection.name})`);

    // ==========================================
    // Handle QR Code update
    // ==========================================
    if (event === "qr.update") {
      const qrCode = eventPayload?.qrCode;
      if (qrCode) {
        await supabaseClient
          .from("connections")
          .update({
            qr_code: qrCode,
            status: "connecting",
            updated_at: new Date().toISOString(),
          })
          .eq("id", connection.id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // Handle session status events
    // ==========================================
    if (event === "session.status") {
      const status = mapBaileysStatus(eventPayload?.status || "STOPPED");
      console.log(`[Baileys Webhook] Session ${session} status changed to: ${status}`);

      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === "connected") {
        updates.qr_code = null;
        if (eventPayload?.me?.id) {
          updates.phone_number = eventPayload.me.id.replace("@s.whatsapp.net", "").split(":")[0];
        }
      }

      await supabaseClient.from("connections").update(updates).eq("id", connection.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // Handle message events
    // ==========================================
    if (event === "message") {
      const msg = eventPayload;

      if (!msg) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Skip outgoing messages
      if (msg.fromMe) {
        console.log("[Baileys Webhook] Skipping outgoing message");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Parse the "from" address - detect LID vs real phone
      const rawFrom = msg.from || "";
      const { identifier: from, isLid } = parseFromAddress(rawFrom);
      
      const body = msg.body || "";
      const messageId = msg.id || `baileys_${Date.now()}`;
      const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();

      console.log(`[Baileys Webhook] Message from: ${rawFrom}, isLid: ${isLid}, parsed: ${from}, body: ${body?.substring(0, 50)}`);

      // Determine message type and handle media
      let messageType = "text";
      let mediaUrl: string | null = null;

      if (msg.hasMedia && msg.mediaUrl) {
        messageType = msg.type || "document";
        if (messageType === "ptt") messageType = "audio";
        mediaUrl = await storeMediaFromBase64(supabaseClient, session, messageId, msg.mediaUrl);
      }

      // Find or create contact - handle LID vs real phone differently
      let contact;
      
      if (isLid) {
        // LID contact: search by whatsapp_lid first, then by phone (in case it was stored incorrectly before)
        const { data: existingByLid } = await supabaseClient
          .from("contacts")
          .select("*")
          .eq("whatsapp_lid", from)
          .maybeSingle();
        
        if (existingByLid) {
          contact = existingByLid;
        } else {
          // Check if LID was previously stored as phone
          const { data: existingByPhone } = await supabaseClient
            .from("contacts")
            .select("*")
            .eq("phone", from)
            .maybeSingle();
          
          if (existingByPhone) {
            // Fix: move LID from phone to whatsapp_lid
            console.log(`[Baileys Webhook] Fixing contact ${existingByPhone.id}: moving LID from phone to whatsapp_lid`);
            await supabaseClient
              .from("contacts")
              .update({ 
                whatsapp_lid: from, 
                phone: null,
                name: msg.pushName && existingByPhone.name === from ? msg.pushName : existingByPhone.name,
                updated_at: new Date().toISOString() 
              })
              .eq("id", existingByPhone.id);
            contact = { ...existingByPhone, whatsapp_lid: from, phone: null };
          } else {
            // Create new contact with LID (not phone)
            const { data: newContact, error: contactError } = await supabaseClient
              .from("contacts")
              .insert({
                whatsapp_lid: from,
                phone: null,
                name: msg.pushName || `Contato ${from.slice(-6)}`,
                tenant_id: connection.tenant_id,
              })
              .select()
              .single();

            if (contactError) {
              console.error("[Baileys Webhook] Error creating LID contact:", contactError);
              return new Response(
                JSON.stringify({ success: false, error: contactError.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            contact = newContact;
            console.log(`[Baileys Webhook] Created LID contact: ${contact.id} (whatsapp_lid: ${from})`);
          }
        }
      } else {
        // Regular phone contact
        const { data: existingContact } = await supabaseClient
          .from("contacts")
          .select("*")
          .eq("phone", from)
          .maybeSingle();

        if (existingContact) {
          contact = existingContact;
          if (
            msg.pushName &&
            (!contact.name || contact.name === from || contact.name === "Contato Desconhecido")
          ) {
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
            console.error("[Baileys Webhook] Error creating contact:", contactError);
            return new Response(
              JSON.stringify({ success: false, error: contactError.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          contact = newContact;
        }
      }

      // Update contact name if pushName is better
      if (msg.pushName && contact.name !== msg.pushName && 
          (contact.name === `Contato ${from.slice(-6)}` || contact.name === "Contato Desconhecido" || contact.name === from)) {
        await supabaseClient
          .from("contacts")
          .update({ name: msg.pushName, updated_at: new Date().toISOString() })
          .eq("id", contact.id);
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
          console.error("[Baileys Webhook] Error creating conversation:", convError);
          return new Response(
            JSON.stringify({ success: false, error: convError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        conversation = newConversation;
      }

      // Save message - NO external_id (column doesn't exist)
      const { error: msgError } = await supabaseClient.from("messages").insert({
        conversation_id: conversation.id,
        content: body,
        message_type: messageType,
        media_url: mediaUrl,
        sender_type: "contact",
        is_read: false,
        tenant_id: connection.tenant_id,
      });

      if (msgError) {
        console.error("[Baileys Webhook] Error saving message:", msgError);
      } else {
        console.log(`[Baileys Webhook] ✅ Message saved for conversation: ${conversation.id}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle other events
    console.log(`[Baileys Webhook] Unhandled event: ${event}`);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Baileys Webhook] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
