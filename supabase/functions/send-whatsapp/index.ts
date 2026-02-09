import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API_URL = "https://graph.facebook.com/v18.0";

interface SendMessagePayload {
  conversationId: string;
  content: string;
  messageType?: "text" | "image" | "audio" | "document" | "video";
  mediaUrl?: string;
}

interface SessionData {
  sessionName?: string;
  token?: string;
  instanceName?: string;
  engine?: string;
  access_token?: string;
  phone_number_id?: string;
}

interface Connection {
  id: string;
  type: string;
  status: string;
  session_data: SessionData | null;
  name: string;
  is_default: boolean;
}

// ========== Baileys Send ==========
async function sendViaBaileys(
  connection: Connection,
  phoneToSend: string,
  content: string,
  messageType: string,
  mediaUrl: string | undefined,
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  isLidSend: boolean = false
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { data: settings } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "baileys_server_url")
    .single();

  const { data: apiKeySettings } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "baileys_api_key")
    .single();

  const baileysUrl = settings?.value;
  const baileysApiKey = apiKeySettings?.value;

  if (!baileysUrl) {
    return { success: false, error: "Baileys server URL not configured" };
  }

  const sessionData = connection.session_data;
  const sessionName = sessionData?.sessionName || connection.name.toLowerCase().replace(/\s+/g, "_");

  console.log(`[Baileys] Using session: ${sessionName}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (baileysApiKey) {
    headers["X-API-Key"] = baileysApiKey;
  }

  let formattedNumber: string;
  if (isLidSend) {
    formattedNumber = `${phoneToSend.replace(/\D/g, "")}@lid`;
    console.log(`[Baileys] Sending to LID: ${formattedNumber}`);
  } else {
    formattedNumber = phoneToSend.replace(/\D/g, "");
    if (!formattedNumber.startsWith("55") && formattedNumber.length <= 11) {
      formattedNumber = "55" + formattedNumber;
    }
    console.log(`[Baileys] Sending to phone: ${formattedNumber}`);
  }

  let response;

  if (mediaUrl && messageType !== "text") {
    response = await fetch(`${baileysUrl}/sessions/${sessionName}/send/media`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: formattedNumber,
        mediaUrl,
        caption: content,
        mediaType: messageType,
      }),
    });
  } else {
    response = await fetch(`${baileysUrl}/sessions/${sessionName}/send/text`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: formattedNumber,
        text: content,
      }),
    });
  }

  const result = await response.json();
  console.log("[Baileys] Response:", JSON.stringify(result));

  if (!result.success) {
    return { success: false, error: result.error || "Failed to send message" };
  }

  return { success: true, messageId: result.data?.messageId };
}

// ========== Meta API Send ==========
async function sendViaMetaAPI(
  connection: Connection,
  phoneToSend: string,
  content: string,
  messageType: string,
  mediaUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const sessionData = connection.session_data;

  if (!sessionData?.access_token || !sessionData?.phone_number_id) {
    return { success: false, error: "Meta API credentials not configured" };
  }

  const formattedTo = phoneToSend.replace(/[^\d]/g, "");

  let payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formattedTo,
    type: "text",
  };

  if (messageType === "image" && mediaUrl) {
    payload.type = "image";
    payload.image = { link: mediaUrl, caption: content };
  } else if (messageType === "video" && mediaUrl) {
    payload.type = "video";
    payload.video = { link: mediaUrl, caption: content };
  } else if (messageType === "audio" && mediaUrl) {
    payload.type = "audio";
    payload.audio = { link: mediaUrl };
  } else if (messageType === "document" && mediaUrl) {
    payload.type = "document";
    payload.document = { link: mediaUrl, caption: content };
  } else {
    payload.type = "text";
    payload.text = { body: content, preview_url: true };
  }

  console.log("[Meta API] Sending message:", JSON.stringify(payload));

  const response = await fetch(
    `${META_API_URL}/${sessionData.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${sessionData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error("[Meta API] Error:", result);
    return { success: false, error: result.error?.message || "Failed to send message" };
  }

  console.log("[Meta API] Success:", result);
  return { success: true, messageId: result.messages?.[0]?.id };
}

// ========== Main Handler ==========
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: missing token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !userData?.user) {
      console.error("[send-whatsapp] Auth error:", authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    console.log(`[send-whatsapp] Authenticated user: ${userId}`);

    // 2. Parse payload
    const payload: SendMessagePayload = await req.json();
    const { conversationId, content, messageType = "text", mediaUrl } = payload;

    if (!conversationId || !content) {
      return new Response(
        JSON.stringify({ success: false, error: "conversationId and content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-whatsapp] Sending to conversation: ${conversationId}, type: ${messageType}`);

    // 3. Get conversation with contact
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("*, contacts(*)")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("[send-whatsapp] Conversation not found:", convError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // deno-lint-ignore no-explicit-any
    const contact = (conversation as any).contacts;
    if (!contact) {
      return new Response(
        JSON.stringify({ success: false, error: "Contact not found for conversation" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-whatsapp] Contact: ${contact.name} | Phone: ${contact.phone} | LID: ${contact.whatsapp_lid}`);

    // 4. Determine connection
    let connection: Connection | null = null;

    // Try conversation's connection first
    if (conversation.connection_id) {
      const { data: connData } = await supabaseAdmin
        .from("connections")
        .select("*")
        .eq("id", conversation.connection_id)
        .single();
      if (connData) connection = connData as Connection;
    }

    // Fall back to default connection
    if (!connection) {
      const { data: defaultConn } = await supabaseAdmin
        .from("connections")
        .select("*")
        .eq("is_default", true)
        .eq("status", "connected")
        .limit(1)
        .single();
      if (defaultConn) connection = defaultConn as Connection;
    }

    // Fall back to any connected connection
    if (!connection) {
      const { data: anyConn } = await supabaseAdmin
        .from("connections")
        .select("*")
        .eq("status", "connected")
        .limit(1)
        .single();
      if (anyConn) connection = anyConn as Connection;
    }

    if (!connection) {
      return new Response(
        JSON.stringify({ success: false, error: "No active WhatsApp connection available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-whatsapp] Using connection: ${connection.id} (${connection.name})`);

    // 5. Determine phone/LID to send to
    const contactPhone = contact.phone;
    const contactLid = contact.whatsapp_lid;
    const isLidSend = !contactPhone && !!contactLid;
    const phoneToSend = contactPhone || contactLid;

    if (!phoneToSend) {
      return new Response(
        JSON.stringify({ success: false, error: "Contact has no phone number or WhatsApp LID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Route to appropriate engine
    let sendResult: { success: boolean; messageId?: string; error?: string };

    const engine = connection.session_data?.engine || "baileys";
    const isMeta = engine === "meta" || !!connection.session_data?.access_token;

    if (isMeta) {
      sendResult = await sendViaMetaAPI(connection, phoneToSend, content, messageType, mediaUrl);
    } else {
      sendResult = await sendViaBaileys(connection, phoneToSend, content, messageType, mediaUrl, supabaseAdmin, isLidSend);
    }

    if (!sendResult.success) {
      console.error("[send-whatsapp] Send failed:", sendResult.error);
      return new Response(
        JSON.stringify({ success: false, error: sendResult.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-whatsapp] Message sent successfully, ID: ${sendResult.messageId}`);

    // 7. Save message to database
    const { data: savedMessage, error: msgError } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content: content,
        sender_id: userId,
        sender_type: "agent",
        message_type: messageType,
        media_url: mediaUrl || null,
        is_read: true,
      })
      .select()
      .single();

    if (msgError) {
      console.error("[send-whatsapp] Error saving message:", msgError.message);
      // Message was sent but not saved - still return success
    } else {
      console.log(`[send-whatsapp] Message saved: ${savedMessage.id}`);
    }

    // 8. Update conversation
    await supabaseAdmin
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_bot_active: false,
      })
      .eq("id", conversationId);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: sendResult.messageId,
        savedMessageId: savedMessage?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
Deno.serve(handler);
