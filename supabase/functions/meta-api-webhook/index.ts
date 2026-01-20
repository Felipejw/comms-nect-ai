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

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Webhook Verification (GET request from Meta)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log("[Meta Webhook] Verification request:", { mode, token, challenge });

    // Get the verify token from the connection's session_data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find a Meta API connection with matching verify token
    const { data: connections } = await supabase
      .from("connections")
      .select("id, session_data")
      .eq("type", "meta_api");

    let verified = false;
    for (const conn of connections || []) {
      const sessionData = conn.session_data as { webhook_verify_token?: string } | null;
      if (sessionData?.webhook_verify_token === token) {
        verified = true;
        break;
      }
    }

    if (mode === "subscribe" && verified) {
      console.log("[Meta Webhook] Verification successful");
      return new Response(challenge, { status: 200 });
    } else {
      console.log("[Meta Webhook] Verification failed");
      return new Response("Forbidden", { status: 403 });
    }
  }

  // Handle incoming messages (POST request)
  if (req.method === "POST") {
    try {
      const payload: WebhookPayload = await req.json();
      console.log("[Meta Webhook] Received payload:", JSON.stringify(payload, null, 2));

      if (payload.object !== "whatsapp_business_account") {
        return new Response("Not a WhatsApp event", { status: 200 });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          if (change.field !== "messages") continue;

          const value = change.value;
          const phoneNumberId = value.metadata.phone_number_id;
          const displayPhone = value.metadata.display_phone_number;

          // Find the connection by phone_number_id
          const { data: connection } = await supabase
            .from("connections")
            .select("id, tenant_id, session_data")
            .eq("type", "meta_api")
            .filter("session_data->phone_number_id", "eq", phoneNumberId)
            .single();

          if (!connection) {
            console.log(`[Meta Webhook] No connection found for phone_number_id: ${phoneNumberId}`);
            continue;
          }

          const tenantId = connection.tenant_id;

          // Handle status updates
          if (value.statuses) {
            for (const status of value.statuses) {
              console.log(`[Meta Webhook] Status update: ${status.id} -> ${status.status}`);
              
              // Update message read status if delivered/read
              if (status.status === "read") {
                await supabase
                  .from("messages")
                  .update({ is_read: true })
                  .eq("tenant_id", tenantId)
                  .filter("content", "cs", `{"wamid":"${status.id}"}`);
              }
            }
          }

          // Handle incoming messages
          if (value.messages && value.contacts) {
            for (let i = 0; i < value.messages.length; i++) {
              const message = value.messages[i];
              const contact = value.contacts[i] || value.contacts[0];
              const senderPhone = message.from;
              const senderName = contact.profile.name || senderPhone;

              console.log(`[Meta Webhook] Message from ${senderName} (${senderPhone}): ${message.type}`);

              // Find or create contact
              let { data: existingContact } = await supabase
                .from("contacts")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("phone", senderPhone)
                .single();

              if (!existingContact) {
                const { data: newContact } = await supabase
                  .from("contacts")
                  .insert({
                    tenant_id: tenantId,
                    name: senderName,
                    phone: senderPhone,
                    status: "active",
                  })
                  .select("id")
                  .single();
                existingContact = newContact;
              }

              if (!existingContact) {
                console.error("[Meta Webhook] Failed to create/find contact");
                continue;
              }

              // Find or create conversation
              let { data: conversation } = await supabase
                .from("conversations")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("contact_id", existingContact.id)
                .eq("connection_id", connection.id)
                .in("status", ["new", "in_progress"])
                .single();

              if (!conversation) {
                const { data: newConversation } = await supabase
                  .from("conversations")
                  .insert({
                    tenant_id: tenantId,
                    contact_id: existingContact.id,
                    connection_id: connection.id,
                    channel: "whatsapp",
                    status: "new",
                    is_bot_active: true,
                  })
                  .select("id")
                  .single();
                conversation = newConversation;
              }

              if (!conversation) {
                console.error("[Meta Webhook] Failed to create/find conversation");
                continue;
              }

              // Determine message content and type
              let content = "";
              let messageType: "text" | "image" | "audio" | "video" | "document" = "text";
              let mediaUrl: string | null = null;

              switch (message.type) {
                case "text":
                  content = message.text?.body || "";
                  break;
                case "image":
                  messageType = "image";
                  content = message.image?.caption || "[Imagem]";
                  // Media URL would need to be fetched from Meta API using message.image.id
                  break;
                case "audio":
                  messageType = "audio";
                  content = "[Áudio]";
                  break;
                case "video":
                  messageType = "video";
                  content = message.video?.caption || "[Vídeo]";
                  break;
                case "document":
                  messageType = "document";
                  content = message.document?.filename || "[Documento]";
                  break;
                case "sticker":
                  messageType = "image";
                  content = "[Sticker]";
                  break;
                case "location":
                  content = `📍 Localização: ${message.location?.name || ""} ${message.location?.address || ""} (${message.location?.latitude}, ${message.location?.longitude})`;
                  break;
                case "button":
                  content = message.button?.text || "[Botão]";
                  break;
                case "interactive":
                  content = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "[Interativo]";
                  break;
                default:
                  content = `[${message.type}]`;
              }

              // Save message
              const { error: messageError } = await supabase
                .from("messages")
                .insert({
                  tenant_id: tenantId,
                  conversation_id: conversation.id,
                  content: content,
                  message_type: messageType,
                  media_url: mediaUrl,
                  sender_type: "contact",
                  sender_id: existingContact.id,
                  is_read: false,
                });

              if (messageError) {
                console.error("[Meta Webhook] Error saving message:", messageError);
              } else {
                console.log("[Meta Webhook] Message saved successfully");
              }

              // Update conversation
              await supabase
                .from("conversations")
                .update({
                  last_message_at: new Date().toISOString(),
                  unread_count: supabase.rpc("increment", { x: 1 }),
                })
                .eq("id", conversation.id);

              // Update contact last_contact_at
              await supabase
                .from("contacts")
                .update({ last_contact_at: new Date().toISOString() })
                .eq("id", existingContact.id);
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[Meta Webhook] Error:", error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
