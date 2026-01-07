import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// WPPConnect API configuration
const WPPCONNECT_API_URL = Deno.env.get("WPPCONNECT_API_URL") || Deno.env.get("EVOLUTION_API_URL");
const WPPCONNECT_SECRET_KEY = Deno.env.get("WPPCONNECT_SECRET_KEY") || Deno.env.get("EVOLUTION_API_KEY");

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
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!WPPCONNECT_API_URL) {
      throw new Error("WPPConnect API URL not configured");
    }

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
        contact:contacts (id, name, phone, whatsapp_lid)
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
      // WPPConnect has better LID support - try to resolve it
      console.log(`Contact only has LID: ${whatsappLid}, will try to send directly`);
      phoneToSend = whatsappLid;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Contato sem número de telefone válido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get default WhatsApp connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from("connections")
      .select("*")
      .eq("type", "whatsapp")
      .eq("status", "connected")
      .order("is_default", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      console.error("No connected WhatsApp instance:", connError);
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma conexão WhatsApp disponível" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionData = connection.session_data as SessionData;
    const sessionName = sessionData?.sessionName || sessionData?.instanceName || connection.name;
    const sessionToken = sessionData?.token || WPPCONNECT_SECRET_KEY;

    console.log(`Using session: ${sessionName}`);

    // Verify connection status
    try {
      const statusCheck = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/check-connection-session`, {
        headers: { "Authorization": `Bearer ${sessionToken}` }
      });
      const statusResult = await statusCheck.json();
      console.log(`Session ${sessionName} status:`, JSON.stringify(statusResult));
      
      if (statusResult.status !== true && statusResult.status !== "CONNECTED" && statusResult.state !== "CONNECTED") {
        await supabaseAdmin
          .from("connections")
          .update({ status: 'disconnected' })
          .eq("id", connection.id);
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "WhatsApp desconectado. Por favor, reconecte na página de Conexões.",
            needsReconnection: true,
            connectionId: connection.id 
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (statusError) {
      console.error("Error checking connection status:", statusError);
    }

    // Format the number for WPPConnect - uses @c.us format
    let formattedNumber = phoneToSend!.replace(/\D/g, "");
    
    // Add country code if needed
    if (!formattedNumber.startsWith("55") && formattedNumber.length <= 11) {
      formattedNumber = "55" + formattedNumber;
    }
    
    // WPPConnect uses @c.us format for phone numbers
    formattedNumber = `${formattedNumber}@c.us`;
    
    console.log(`Sending to: ${formattedNumber}`);

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
    console.log("WPPConnect response:", JSON.stringify(wppResult));

    if (!wppResponse.ok || wppResult.status === "error" || wppResult.error) {
      console.error("WPPConnect error:", wppResult);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: wppResult.message || wppResult.error || "Erro ao enviar mensagem",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      })
      .eq("id", conversationId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: wppResult.id || wppResult.messageId,
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
