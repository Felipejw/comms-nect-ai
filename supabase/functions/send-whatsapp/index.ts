import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// WPPConnect API configuration
const WPPCONNECT_API_URL = Deno.env.get("WPPCONNECT_API_URL") || Deno.env.get("EVOLUTION_API_URL");
const WPPCONNECT_SECRET_KEY = Deno.env.get("WPPCONNECT_SECRET_KEY") || Deno.env.get("EVOLUTION_API_KEY");
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
  // Meta API fields
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
  tenant_id: string;
}

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

async function sendViaWPPConnect(
  connection: Connection,
  phoneToSend: string,
  content: string,
  messageType: string,
  mediaUrl: string | undefined,
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any
): Promise<{ success: boolean; messageId?: string; error?: string; needsReconnection?: boolean }> {
  if (!WPPCONNECT_API_URL) {
    return { success: false, error: "WPPConnect API URL not configured" };
  }

  const sessionData = connection.session_data;
  const sessionName = sessionData?.sessionName || sessionData?.instanceName || connection.name;
  const sessionToken = sessionData?.token || WPPCONNECT_SECRET_KEY;

  console.log(`[WPPConnect] Using session: ${sessionName}`);

  // Verify connection status
  try {
    const statusCheck = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/check-connection-session`, {
      headers: { "Authorization": `Bearer ${sessionToken}` }
    });
    const statusResult = await statusCheck.json();
    console.log(`[WPPConnect] Session ${sessionName} status:`, JSON.stringify(statusResult));
    
    if (statusResult.status !== true && statusResult.status !== "CONNECTED" && statusResult.state !== "CONNECTED") {
      await supabaseAdmin
        .from("connections")
        .update({ status: "disconnected" })
        .eq("id", connection.id);
      
      return {
        success: false, 
        error: "WhatsApp desconectado. Por favor, reconecte na página de Conexões.",
        needsReconnection: true 
      };
    }
  } catch (statusError) {
    console.error("[WPPConnect] Error checking connection status:", statusError);
  }

  // Format the number for WPPConnect - uses @c.us format
  let formattedNumber = phoneToSend.replace(/\D/g, "");
  
  // Add country code if needed
  if (!formattedNumber.startsWith("55") && formattedNumber.length <= 11) {
    formattedNumber = "55" + formattedNumber;
  }
  
  // WPPConnect uses @c.us format for phone numbers
  formattedNumber = `${formattedNumber}@c.us`;
  
  console.log(`[WPPConnect] Sending to: ${formattedNumber}`);

  let wppResponse;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${sessionToken}`,
  };

  if (messageType === "text") {
    wppResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/send-message`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedNumber,
        message: content,
      }),
    });
  } else if (messageType === "image" && mediaUrl) {
    wppResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/send-image`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedNumber,
        path: mediaUrl,
        caption: content,
      }),
    });
  } else if (messageType === "document" && mediaUrl) {
    wppResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/send-file`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedNumber,
        path: mediaUrl,
        filename: content || "document",
      }),
    });
  } else if (messageType === "audio" && mediaUrl) {
    wppResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/send-voice-base64`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedNumber,
        base64Ptt: mediaUrl,
      }),
    });
  } else if (messageType === "video" && mediaUrl) {
    wppResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/send-file`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedNumber,
        path: mediaUrl,
        caption: content,
      }),
    });
  } else {
    // Default to text
    wppResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/send-message`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedNumber,
        message: content,
      }),
    });
  }

  const wppResult = await wppResponse.json();
  console.log("[WPPConnect] Response:", JSON.stringify(wppResult));

  if (!wppResponse.ok || wppResult.status === "error" || wppResult.error) {
    console.error("[WPPConnect] Error:", wppResult);
    return { 
      success: false, 
      error: wppResult.message || wppResult.error || "Erro ao enviar mensagem" 
    };
  }

  return { success: true, messageId: wppResult.id || wppResult.messageId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client for validating user token
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    // Client for database operations with elevated privileges
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth validation failed:", authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Authenticated user: ${user.id}`);

    const payload: SendMessagePayload = await req.json();
    const { conversationId, content, messageType = "text", mediaUrl } = payload;

    console.log(`Sending WhatsApp message for conversation: ${conversationId}`);

    // Get conversation with contact phone and LID
    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select(`
        *,
        contact:contacts (id, name, phone, whatsapp_lid),
        connection:connections (id, type, status, session_data, name, is_default, tenant_id)
      `)
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("Conversation not found:", convError);
      return new Response(
        JSON.stringify({ success: false, error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contact = conversation.contact;
    const phone = contact?.phone;
    const whatsappLid = contact?.whatsapp_lid;
    
    console.log(`Contact data: phone="${phone}", whatsapp_lid="${whatsappLid}"`);
    
    // Determine phone to send
    let phoneToSend: string | null = null;
    
    if (phone && phone.length >= 10 && phone.length <= 15) {
      phoneToSend = phone;
      console.log(`Using phone number: ${phoneToSend}`);
    } else if (whatsappLid) {
      console.log(`Contact only has LID: ${whatsappLid}, will try to send directly`);
      phoneToSend = whatsappLid;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Contato sem número de telefone válido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to use the conversation's connection first, then find a default one
    let connection: Connection | null = conversation.connection;
    
    if (!connection || connection.status !== "connected") {
      // Find any available connected connection (prefer Meta API, then WPPConnect)
      const { data: connections } = await supabaseAdmin
        .from("connections")
        .select("id, type, status, session_data, name, is_default, tenant_id")
        .in("type", ["whatsapp", "meta_api"])
        .eq("status", "connected")
        .order("is_default", { ascending: false });

      if (connections && connections.length > 0) {
        // Prefer Meta API connections
        connection = connections.find(c => c.type === "meta_api") || connections[0];
      }
    }

    if (!connection) {
      console.error("No connected WhatsApp instance found");
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma conexão WhatsApp disponível" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Using connection: ${connection.name} (type: ${connection.type})`);

    // Send message based on connection type
    let result: { success: boolean; messageId?: string; error?: string; needsReconnection?: boolean };

    if (connection.type === "meta_api") {
      result = await sendViaMetaAPI(connection, phoneToSend!, content, messageType, mediaUrl);
    } else {
      result = await sendViaWPPConnect(connection, phoneToSend!, content, messageType, mediaUrl, supabaseAdmin);
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error,
          needsReconnection: result.needsReconnection,
          connectionId: connection.id 
        }),
        { status: result.needsReconnection ? 503 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save message to database
    const { error: msgError } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content,
        message_type: messageType,
        media_url: mediaUrl,
        sender_id: user.id,
        sender_type: "agent",
        is_read: true,
      });

    if (msgError) {
      console.error("Error saving message:", msgError);
    }

    // Update conversation
    await supabaseAdmin
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        status: conversation.status === "new" ? "in_progress" : conversation.status,
        connection_id: connection.id,
      })
      .eq("id", conversationId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.messageId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro interno" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
