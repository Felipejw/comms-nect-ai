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
function parseFromAddress(rawFrom: string, rawJid?: string): { identifier: string; isLid: boolean } {
  const jidToCheck = rawJid || rawFrom;
  const isLid = jidToCheck.endsWith("@lid");
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
    const matches = base64Data.match(/^data:([\w\/\-\+\.]+(?:;\s*[\w\-]+=[\w\-]+)*);base64,(.+)$/);
    if (!matches) return null;

    const fullMimetype = matches[1];
    const mimetype = fullMimetype.split(';')[0].trim();
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

// Resolve LID to real phone number in background via Baileys API
async function resolveLidInBackground(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  contactId: string,
  lidIdentifier: string,
  // deno-lint-ignore no-explicit-any
  connection: any
): Promise<void> {
  try {
    console.log(`[LID Resolution] Starting background resolution for contact ${contactId}, LID: ${lidIdentifier}`);

    const { data: settings } = await supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_server_url")
      .single();

    const { data: apiKeySettings } = await supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_key")
      .single();

    const baileysUrl = settings?.value;
    const baileysApiKey = apiKeySettings?.value;

    if (!baileysUrl) {
      console.log("[LID Resolution] Baileys server URL not configured, skipping");
      return;
    }

    const sessionData = connection.session_data;
    const sessionName = sessionData?.sessionName || connection.name.toLowerCase().replace(/\s+/g, "_");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (baileysApiKey) {
      headers["X-API-Key"] = baileysApiKey;
    }

    const contactsResponse = await fetch(
      `${baileysUrl}/sessions/${sessionName}/contacts/${lidIdentifier}@lid`,
      { method: "GET", headers }
    );

    if (contactsResponse.ok) {
      const contactData = await contactsResponse.json();
      console.log(`[LID Resolution] Baileys response:`, JSON.stringify(contactData).substring(0, 300));

      const realPhone = contactData?.phone || contactData?.jid?.replace("@s.whatsapp.net", "") || null;

      if (realPhone && !realPhone.includes("@lid")) {
        const cleanPhone = realPhone.replace(/\D/g, "");
        if (cleanPhone.length >= 10 && cleanPhone.length <= 15) {
          console.log(`[LID Resolution] ✅ Resolved LID ${lidIdentifier} to phone: ${cleanPhone}`);
          await supabaseClient
            .from("contacts")
            .update({ phone: cleanPhone, updated_at: new Date().toISOString() })
            .eq("id", contactId);
          return;
        }
      }
    } else {
      const errorText = await contactsResponse.text().catch(() => "");
      console.log(`[LID Resolution] Baileys contacts endpoint returned ${contactsResponse.status}: ${errorText.substring(0, 200)}`);
    }

    console.log(`[LID Resolution] Could not resolve LID ${lidIdentifier} to real phone number`);
  } catch (error) {
    console.error("[LID Resolution] Error:", error);
  }
}

// Merge LID contact when real phone number arrives with matching pushName
async function mergeLidContactByPushName(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  realPhone: string,
  pushName: string
// deno-lint-ignore no-explicit-any
): Promise<any | null> {
  try {
    console.log(`[LID Merge] Checking for LID contacts with pushName "${pushName}" to merge with phone ${realPhone}`);

    const query = supabaseClient
      .from("contacts")
      .select("id, whatsapp_lid, phone, name")
      .eq("name", pushName)
      .is("phone", null)
      .not("whatsapp_lid", "is", null);

    const { data: lidContacts } = await query;

    if (!lidContacts || lidContacts.length === 0) {
      console.log("[LID Merge] No LID contacts found with matching pushName");
      return null;
    }

    if (lidContacts.length > 1) {
      console.log(`[LID Merge] Found ${lidContacts.length} LID contacts with same pushName - ambiguous, skipping merge`);
      return null;
    }

    const lidContact = lidContacts[0];
    console.log(`[LID Merge] ✅ Merging LID contact ${lidContact.id} (LID: ${lidContact.whatsapp_lid}) with phone: ${realPhone}`);

    await supabaseClient
      .from("contacts")
      .update({ phone: realPhone, updated_at: new Date().toISOString() })
      .eq("id", lidContact.id);

    return { ...lidContact, phone: realPhone };
  } catch (error) {
    console.error("[LID Merge] Error:", error);
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
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

    // deno-lint-ignore no-explicit-any
    const connection = connections?.find((c: any) => {
      const sessionData = c.session_data;
      return sessionData?.sessionName === session;
    });

    if (!connection) {
      console.log(`[Baileys Webhook] Connection not found for session: ${session}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Baileys Webhook] Found connection: ${connection.id} (${connection.name})`);

    // ========== Handle QR Code Update ==========
    if (event === "qr.update") {
      const qrCode = eventPayload?.qrCode || eventPayload?.qr || eventPayload;
      console.log("[Baileys Webhook] QR code received, length:", typeof qrCode === "string" ? qrCode.length : "N/A");

      await supabaseClient
        .from("connections")
        .update({
          qr_code: typeof qrCode === "string" ? qrCode : JSON.stringify(qrCode),
          status: "waiting_qr",
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== Handle Session Status ==========
    if (event === "session.status") {
      const status = eventPayload?.status || eventPayload;
      const mappedStatus = mapBaileysStatus(typeof status === "string" ? status : String(status));
      console.log(`[Baileys Webhook] Session status: ${status} -> ${mappedStatus}`);

      const updates: Record<string, unknown> = {
        status: mappedStatus,
        updated_at: new Date().toISOString(),
      };

      if (mappedStatus === "connected") {
        updates.qr_code = null;
        // Try to get phone number from payload
        if (eventPayload?.phoneNumber) {
          updates.phone_number = eventPayload.phoneNumber;
        } else if (eventPayload?.me?.id) {
          updates.phone_number = String(eventPayload.me.id).split(':')[0].replace('@s.whatsapp.net', '');
        }
      }

      if (mappedStatus === "disconnected" && connection.disconnect_requested) {
        updates.disconnect_requested = false;
      }

      await supabaseClient
        .from("connections")
        .update(updates)
        .eq("id", connection.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== Handle Incoming Message ==========
    if (event === "message") {
      const msgPayload = eventPayload || {};
      const rawFrom = msgPayload.from || "";
      const rawJid = msgPayload.rawJid || msgPayload.jid || "";
      const pushName = msgPayload.pushName || msgPayload.senderName || "";
      const messageId = msgPayload.messageId || msgPayload.id || `msg_${Date.now()}`;
      const isFromMe = msgPayload.fromMe === true;

      // Detect group messages
      const isGroup = rawFrom.endsWith("@g.us");
      if (isGroup) {
        console.log("[Baileys Webhook] Processing group message from:", rawFrom);
      }

      const { identifier, isLid } = parseFromAddress(rawFrom, rawJid);
      console.log(`[Baileys Webhook] Message from: ${identifier}, isLid: ${isLid}, fromMe: ${isFromMe}, pushName: ${pushName}`);

      // Determine message content and type
      let messageContent = "";
      let msgType: "text" | "image" | "audio" | "video" | "document" = "text";
      let mediaUrl: string | null = null;

      if (msgPayload.message || msgPayload.text || msgPayload.body) {
        messageContent = msgPayload.message || msgPayload.text || msgPayload.body || "";
      }

      // Handle media types
      if (msgPayload.hasMedia || msgPayload.mediaData || msgPayload.base64 || msgPayload.mediaUrl) {
        const base64Data = msgPayload.base64 || msgPayload.mediaData || msgPayload.mediaUrl;
        if (msgPayload.mediaType === "image" || msgPayload.type === "image") {
          msgType = "image";
          messageContent = msgPayload.caption || messageContent || "[Imagem]";
        } else if (msgPayload.mediaType === "audio" || msgPayload.type === "audio" || msgPayload.type === "ptt") {
          msgType = "audio";
          messageContent = messageContent || "[Áudio]";
        } else if (msgPayload.mediaType === "video" || msgPayload.type === "video") {
          msgType = "video";
          messageContent = msgPayload.caption || messageContent || "[Vídeo]";
        } else if (msgPayload.mediaType === "document" || msgPayload.type === "document") {
          msgType = "document";
          messageContent = msgPayload.caption || msgPayload.fileName || messageContent || "[Documento]";
        }

        // Store media if base64 is available
        if (base64Data) {
          const sessionData = connection.session_data as { sessionName?: string } | null;
          const sessName = sessionData?.sessionName || session;
          mediaUrl = await storeMediaFromBase64(supabaseClient, sessName, messageId, base64Data);
        }

        // If no base64 but has media, try downloading from Baileys server inline
        if (!mediaUrl && (msgPayload.hasMedia || msgPayload.mediaType)) {
          try {
            const { data: settings } = await supabaseClient
              .from("system_settings")
              .select("value")
              .eq("key", "baileys_server_url")
              .single();

            const { data: apiKeySettings } = await supabaseClient
              .from("system_settings")
              .select("value")
              .eq("key", "baileys_api_key")
              .single();

            const baileysUrl = settings?.value;
            const baileysApiKey = apiKeySettings?.value;

            if (baileysUrl) {
              const sessionData = connection.session_data as { sessionName?: string } | null;
              const sessName = sessionData?.sessionName || session;
              const dlHeaders: Record<string, string> = { "Content-Type": "application/json" };
              if (baileysApiKey) dlHeaders["X-API-Key"] = baileysApiKey;

              console.log(`[Baileys Webhook] Attempting inline media download from ${baileysUrl}/sessions/${sessName}/messages/${messageId}/media`);
              const mediaResp = await fetch(
                `${baileysUrl}/sessions/${sessName}/messages/${messageId}/media`,
                { method: "GET", headers: dlHeaders }
              );

              if (mediaResp.ok) {
                const respCT = mediaResp.headers.get("content-type") || "";
                if (respCT.includes("application/json")) {
                  const jsonResp = await mediaResp.json();
                  if (jsonResp.base64) {
                    const dataUri = `data:${jsonResp.mimetype || "application/octet-stream"};base64,${jsonResp.base64}`;
                    mediaUrl = await storeMediaFromBase64(supabaseClient, sessName, messageId, dataUri);
                    console.log(`[Baileys Webhook] Inline media download success: ${mediaUrl ? 'stored' : 'failed'}`);
                  }
                } else {
                  const arrayBuf = await mediaResp.arrayBuffer();
                  const buffer = new Uint8Array(arrayBuf);
                  if (buffer.length > 0) {
                    const ext = msgType === "audio" ? "ogg" : msgType === "image" ? "jpg" : msgType === "video" ? "mp4" : "bin";
                    const storagePath = `${sessName}/${messageId}.${ext}`;
                    await supabaseClient.storage.from("whatsapp-media").upload(storagePath, buffer, {
                      contentType: respCT || "application/octet-stream",
                      upsert: true,
                    });
                    const { data: pubUrl } = supabaseClient.storage.from("whatsapp-media").getPublicUrl(storagePath);
                    mediaUrl = pubUrl.publicUrl;
                    console.log(`[Baileys Webhook] Inline binary media stored: ${mediaUrl}`);
                  }
                }
              } else {
                console.log(`[Baileys Webhook] Inline media download failed: ${mediaResp.status}`);
              }
            }
          } catch (inlineMediaErr) {
            console.error("[Baileys Webhook] Inline media download error:", inlineMediaErr);
          }
        }
      }

      // If no content at all, use a fallback
      if (!messageContent) {
        messageContent = msgPayload.type ? `[${msgPayload.type}]` : "[Mensagem]";
      }

      // ---- Find or create contact ----
      // deno-lint-ignore no-explicit-any
      let contact: any = null;

      if (isGroup) {
        // For groups, search by the group identifier
        const groupId = rawFrom.replace("@g.us", "");
        const { data: groupContacts } = await supabaseClient
          .from("contacts")
          .select("*")
          .eq("phone", groupId)
          .eq("is_group", true)
          .limit(1);

        contact = groupContacts?.[0] || null;

        if (!contact) {
          const groupName = pushName || `Grupo ${groupId.substring(0, 10)}`;
          const { data: newContact, error: createError } = await supabaseClient
            .from("contacts")
            .insert({
              name: groupName,
              phone: groupId,
              is_group: true,
              name_source: pushName ? "push_name" : "auto",
              status: "active",
            })
            .select()
            .single();

          if (createError) {
            console.error("[Baileys Webhook] Error creating group contact:", createError.message);
            const { data: retryContacts } = await supabaseClient
              .from("contacts")
              .select("*")
              .eq("phone", groupId)
              .eq("is_group", true)
              .limit(1);
            contact = retryContacts?.[0] || null;
          } else {
            contact = newContact;
            console.log(`[Baileys Webhook] Created new group contact: ${contact.id}`);
          }
        } else {
          // Update group name from pushName if current name is generic
          if (pushName && contact.name_source !== "manual") {
            const isGenericName = contact.name.startsWith("Grupo ") || /^\d+$/.test(contact.name);
            if (isGenericName) {
              await supabaseClient
                .from("contacts")
                .update({ name: pushName, name_source: "push_name", updated_at: new Date().toISOString() })
                .eq("id", contact.id);
              contact.name = pushName;
            }
          }
        }
      } else if (isLid) {
        // Search by LID
        const { data: lidContacts } = await supabaseClient
          .from("contacts")
          .select("*")
          .eq("whatsapp_lid", identifier)
          .limit(1);

        contact = lidContacts?.[0] || null;

        if (!contact) {
          // Try merge by pushName if we have a real phone
          if (pushName) {
            contact = await mergeLidContactByPushName(supabaseClient, "", pushName);
          }

          if (!contact) {
            // Create new LID contact
            const contactName = pushName || `LID ${identifier.substring(0, 8)}`;
            const { data: newContact, error: createError } = await supabaseClient
              .from("contacts")
              .insert({
                name: contactName,
                whatsapp_lid: identifier,
                name_source: pushName ? "push_name" : "auto",
                status: "active",
              })
              .select()
              .single();

            if (createError) {
              console.error("[Baileys Webhook] Error creating LID contact:", createError.message);
              const { data: retryContacts } = await supabaseClient
                .from("contacts")
                .select("*")
                .eq("whatsapp_lid", identifier)
                .limit(1);
              contact = retryContacts?.[0] || null;
            } else {
              contact = newContact;
              console.log(`[Baileys Webhook] Created new LID contact: ${contact.id}`);
            }
          }
        } else {
          // Update name from pushName if current name is generic
          if (pushName && contact.name_source !== "manual") {
            const isGenericName = contact.name.startsWith("LID ") || contact.name === "Contato Desconhecido" || /^\d{14,}$/.test(contact.name);
            if (isGenericName) {
              await supabaseClient
                .from("contacts")
                .update({ name: pushName, name_source: "push_name", updated_at: new Date().toISOString() })
                .eq("id", contact.id);
              contact.name = pushName;
            }
          }
        }
      } else {
        // Search by phone
        const cleanPhone = identifier.replace(/\D/g, "");
        const { data: phoneContacts } = await supabaseClient
          .from("contacts")
          .select("*")
          .eq("phone", cleanPhone)
          .limit(1);

        contact = phoneContacts?.[0] || null;

        if (!contact) {
          // Try merge by pushName
          if (pushName) {
            contact = await mergeLidContactByPushName(supabaseClient, cleanPhone, pushName);
          }

          if (!contact) {
            const contactName = pushName || cleanPhone;
            const { data: newContact, error: createError } = await supabaseClient
              .from("contacts")
              .insert({
                name: contactName,
                phone: cleanPhone,
                name_source: pushName ? "push_name" : "auto",
                status: "active",
              })
              .select()
              .single();

            if (createError) {
              console.error("[Baileys Webhook] Error creating phone contact:", createError.message);
              const { data: retryContacts } = await supabaseClient
                .from("contacts")
                .select("*")
                .eq("phone", cleanPhone)
                .limit(1);
              contact = retryContacts?.[0] || null;
            } else {
              contact = newContact;
              console.log(`[Baileys Webhook] Created new phone contact: ${contact.id}`);
            }
          }
        } else {
          // Update name from pushName
          if (pushName && contact.name_source !== "manual") {
            const isGenericName = /^\d+$/.test(contact.name) || contact.name === "Contato Desconhecido";
            if (isGenericName) {
              await supabaseClient
                .from("contacts")
                .update({ name: pushName, name_source: "push_name", updated_at: new Date().toISOString() })
                .eq("id", contact.id);
              contact.name = pushName;
            }
          }
        }
      }

      if (!contact) {
        console.error("[Baileys Webhook] Could not find or create contact for:", identifier);
        return new Response(JSON.stringify({ success: false, error: "Contact creation failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ---- Find or create conversation ----
      const { data: existingConversations } = await supabaseClient
        .from("conversations")
        .select("*")
        .eq("contact_id", contact.id)
        .in("status", ["new", "in_progress"])
        .order("last_message_at", { ascending: false })
        .limit(1);

      // deno-lint-ignore no-explicit-any
      let conversation: any = existingConversations?.[0] || null;
      let isNewConversation = false;

      if (!conversation) {
        const { data: newConv, error: convError } = await supabaseClient
          .from("conversations")
          .insert({
            contact_id: contact.id,
            connection_id: connection.id,
            status: "new",
            channel: "whatsapp",
            is_bot_active: true,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (convError) {
          console.error("[Baileys Webhook] Error creating conversation:", convError.message);
          return new Response(JSON.stringify({ success: false, error: "Conversation creation failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        conversation = newConv;
        isNewConversation = true;
        console.log(`[Baileys Webhook] Created new conversation: ${conversation.id}`);
      }

      // ---- Save message ----
      const { error: msgError } = await supabaseClient
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          content: messageContent,
          sender_type: isFromMe ? "agent" : "contact",
          sender_id: isFromMe ? null : null,
          message_type: msgType,
          media_url: mediaUrl,
          is_read: isFromMe,
        });

      if (msgError) {
        console.error("[Baileys Webhook] Error saving message:", msgError.message);
      } else {
        console.log(`[Baileys Webhook] Message saved to conversation ${conversation.id}`);
      }

      // ---- Update conversation with latest message info ----
      try {
        const subjectPreview = msgType === 'audio' ? '🎵 Áudio'
          : msgType === 'image' ? '📷 Imagem'
          : msgType === 'video' ? '🎬 Vídeo'
          : msgType === 'document' ? '📎 Documento'
          : messageContent.substring(0, 100);

        const convUpdates: Record<string, unknown> = {
          last_message_at: new Date().toISOString(),
          subject: subjectPreview,
          updated_at: new Date().toISOString(),
        };

        if (!isFromMe) {
          // Increment unread_count
          const currentUnread = conversation.unread_count || 0;
          convUpdates.unread_count = currentUnread + 1;
        }

        await supabaseClient
          .from("conversations")
          .update(convUpdates)
          .eq("id", conversation.id);

        console.log(`[Baileys Webhook] Conversation ${conversation.id} updated: subject="${subjectPreview}", unread=${isFromMe ? 'unchanged' : 'incremented'}`);
      } catch (convUpdateError) {
        console.error("[Baileys Webhook] Error updating conversation:", convUpdateError);
      }

      // Update contact last_contact_at
      await supabaseClient
        .from("contacts")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", contact.id);

      // ---- Trigger chatbot flow (only for incoming messages, not fromMe) ----
      if (!isFromMe && conversation.is_bot_active) {
        try {
          console.log("[Baileys Webhook] Triggering execute-flow for conversation:", conversation.id);
          const flowUrl = `${supabaseUrl}/functions/v1/execute-flow`;
          await fetch(flowUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              conversationId: conversation.id,
              contactId: contact.id,
              message: messageContent,
              connectionId: connection.id,
              isNewConversation,
            }),
          });
        } catch (flowError) {
          console.error("[Baileys Webhook] Error triggering flow:", flowError);
          // Don't fail the webhook because of flow errors
        }
      }

      // ---- Background LID resolution ----
      if (isLid && !contact.phone) {
        // Use EdgeRuntime.waitUntil for background processing
        try {
          const lidPromise = resolveLidInBackground(supabaseClient, contact.id, identifier, connection);
          if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
            EdgeRuntime.waitUntil(lidPromise);
          }
        } catch (e) {
          console.error("[Baileys Webhook] Error starting LID resolution:", e);
        }
      }

      return new Response(JSON.stringify({ success: true, contactId: contact.id, conversationId: conversation.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unknown event - just acknowledge
    console.log(`[Baileys Webhook] Unknown event: ${event}, ignoring`);
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
};

// Declare EdgeRuntime for TypeScript
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

export default handler;
if (import.meta.main) Deno.serve(handler);
