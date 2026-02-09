import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: { id: string; mime_type: string; sha256: string; filename: string; caption?: string };
  sticker?: { id: string; mime_type: string; sha256: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: Array<{ name: { formatted_name: string }; phones: Array<{ phone: string }> }>;
  button?: { text: string; payload: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
}

interface WhatsAppStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; origin: { type: string } };
  pricing?: { billable: boolean; pricing_model: string; category: string };
}

interface WebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      messages?: WhatsAppMessage[];
      statuses?: WhatsAppStatus[];
    };
    field: string;
  }>;
}

interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ========== GET - Webhook Verification ==========
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log("[Meta Webhook] Verification request:", { mode, token: token?.substring(0, 10) + "...", challenge });

    // Get verify token from system settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: verifyTokenSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "meta_webhook_verify_token")
      .single();

    const verifyToken = verifyTokenSetting?.value || "whatsapp_webhook_verify";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("[Meta Webhook] ✅ Verification successful");
      return new Response(challenge || "", { status: 200 });
    }

    console.error("[Meta Webhook] ❌ Verification failed");
    return new Response("Verification failed", { status: 403 });
  }

  // ========== POST - Webhook Events ==========
  if (req.method === "POST") {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const body: WebhookPayload = await req.json();
      console.log("[Meta Webhook] Received webhook:", JSON.stringify(body).substring(0, 500));

      if (body.object !== "whatsapp_business_account") {
        console.log("[Meta Webhook] Not a WhatsApp webhook, ignoring");
        return new Response("OK", { status: 200 });
      }

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field !== "messages") continue;

          const value = change.value;
          const phoneNumberId = value.metadata.phone_number_id;

          // Find the connection by phone_number_id
          const { data: connections } = await supabase
            .from("connections")
            .select("*")
            .eq("type", "whatsapp");

          // deno-lint-ignore no-explicit-any
          const connection = connections?.find((c: any) => {
            const sd = c.session_data;
            return sd?.phone_number_id === phoneNumberId;
          });

          if (!connection) {
            console.log(`[Meta Webhook] No connection found for phone_number_id: ${phoneNumberId}`);
            continue;
          }

          // ---- Process Messages ----
          if (value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
              const waContact = value.contacts?.find((c) => c.wa_id === msg.from);
              const contactName = waContact?.profile?.name || msg.from;
              const contactPhone = msg.from;

              console.log(`[Meta Webhook] Message from ${contactName} (${contactPhone}): ${msg.type}`);

              // Find or create contact
              const cleanPhone = contactPhone.replace(/\D/g, "");
              const { data: existingContacts } = await supabase
                .from("contacts")
                .select("*")
                .eq("phone", cleanPhone)
                .limit(1);

              // deno-lint-ignore no-explicit-any
              let contact: any = existingContacts?.[0] || null;

              if (!contact) {
                const { data: newContact } = await supabase
                  .from("contacts")
                  .insert({
                    name: contactName,
                    phone: cleanPhone,
                    name_source: "push_name",
                    status: "active",
                  })
                  .select()
                  .single();
                contact = newContact;
              }

              if (!contact) {
                console.error("[Meta Webhook] Failed to find/create contact");
                continue;
              }

              // Find or create conversation
              const { data: existingConvs } = await supabase
                .from("conversations")
                .select("*")
                .eq("contact_id", contact.id)
                .in("status", ["new", "in_progress"])
                .order("last_message_at", { ascending: false })
                .limit(1);

              // deno-lint-ignore no-explicit-any
              let conversation: any = existingConvs?.[0] || null;

              if (!conversation) {
                const { data: newConv } = await supabase
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
                conversation = newConv;
              }

              if (!conversation) {
                console.error("[Meta Webhook] Failed to find/create conversation");
                continue;
              }

              // Extract message content
              let messageContent = "";
              let messageType: "text" | "image" | "audio" | "video" | "document" = "text";

              switch (msg.type) {
                case "text":
                  messageContent = msg.text?.body || "";
                  messageType = "text";
                  break;
                case "image":
                  messageContent = msg.image?.caption || "[Imagem]";
                  messageType = "image";
                  break;
                case "audio":
                  messageContent = "[Áudio]";
                  messageType = "audio";
                  break;
                case "video":
                  messageContent = msg.video?.caption || "[Vídeo]";
                  messageType = "video";
                  break;
                case "document":
                  messageContent = msg.document?.caption || msg.document?.filename || "[Documento]";
                  messageType = "document";
                  break;
                case "sticker":
                  messageContent = "[Figurinha]";
                  messageType = "image";
                  break;
                case "location":
                  messageContent = msg.location
                    ? `📍 ${msg.location.name || "Localização"}: ${msg.location.latitude}, ${msg.location.longitude}`
                    : "[Localização]";
                  messageType = "text";
                  break;
                case "contacts":
                  messageContent = msg.contacts
                    ? `👤 ${msg.contacts.map((c) => c.name.formatted_name).join(", ")}`
                    : "[Contato]";
                  messageType = "text";
                  break;
                case "button":
                  messageContent = msg.button?.text || "[Botão]";
                  messageType = "text";
                  break;
                case "interactive":
                  messageContent = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "[Interativo]";
                  messageType = "text";
                  break;
                default:
                  messageContent = `[${msg.type}]`;
                  messageType = "text";
              }

              // Save message
              await supabase.from("messages").insert({
                conversation_id: conversation.id,
                content: messageContent,
                sender_type: "contact",
                message_type: messageType,
                is_read: false,
              });

              // Update contact
              await supabase
                .from("contacts")
                .update({ last_contact_at: new Date().toISOString() })
                .eq("id", contact.id);

              console.log(`[Meta Webhook] Message saved to conversation ${conversation.id}`);

              // Trigger chatbot flow
              if (conversation.is_bot_active) {
                try {
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
                      isNewConversation: !existingConvs?.[0],
                    }),
                  });
                } catch (flowError) {
                  console.error("[Meta Webhook] Error triggering flow:", flowError);
                }
              }
            }
          }

          // ---- Process Status Updates ----
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              console.log(`[Meta Webhook] Status update: ${status.status} for ${status.recipient_id}`);

              const recipientPhone = status.recipient_id.replace(/\D/g, "");

              // Find campaign_contact by phone
              const { data: contactData } = await supabase
                .from("contacts")
                .select("id")
                .eq("phone", recipientPhone)
                .limit(1)
                .single();

              if (!contactData) continue;

              // Find pending campaign contacts
              const { data: campaignContacts } = await supabase
                .from("campaign_contacts")
                .select("id, campaign_id, status")
                .eq("contact_id", contactData.id)
                .eq("status", "sent")
                .order("sent_at", { ascending: false })
                .limit(1);

              const campaignContact = campaignContacts?.[0];

              if (campaignContact) {
                if (status.status === "delivered") {
                  await supabase
                    .from("campaign_contacts")
                    .update({ status: "delivered", delivered_at: new Date().toISOString() })
                    .eq("id", campaignContact.id);

                  // Increment campaign delivered count
                  await supabase.rpc("increment_campaign_delivered", { campaign_id: campaignContact.campaign_id });
                } else if (status.status === "read") {
                  await supabase
                    .from("campaign_contacts")
                    .update({ status: "read", read_at: new Date().toISOString() })
                    .eq("id", campaignContact.id);

                  const wasDelivered = campaignContact.status === "delivered";
                  await supabase.rpc("increment_campaign_read", {
                    campaign_id: campaignContact.campaign_id,
                    was_delivered: wasDelivered,
                  });
                } else if (status.status === "failed") {
                  await supabase
                    .from("campaign_contacts")
                    .update({ status: "failed", last_error: "Delivery failed" })
                    .eq("id", campaignContact.id);
                }
              }
            }
          }
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("[Meta Webhook] Error processing webhook:", error);
      // Always return 200 to Meta to prevent retries
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};

export default handler;
Deno.serve(handler);
