import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendMessagePayload {
  conversationId: string;
  content: string;
  messageType?: "text" | "image" | "audio" | "document";
  mediaUrl?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: SendMessagePayload = await req.json();
    const { conversationId, content, messageType = "text", mediaUrl } = payload;

    console.log(`Sending WhatsApp message for conversation: ${conversationId}`);

    // Get conversation with contact phone
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(`
        *,
        contact:contacts (id, name, phone)
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

    const phone = conversation.contact?.phone;
    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Contact has no phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get default WhatsApp connection
    const { data: connection, error: connError } = await supabase
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
        JSON.stringify({ success: false, error: "No WhatsApp connection available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceName = connection.session_data?.instanceName || connection.name;

    // Format phone number (remove non-numeric and ensure country code)
    let formattedPhone = phone.replace(/\D/g, "");
    if (!formattedPhone.startsWith("55") && formattedPhone.length <= 11) {
      formattedPhone = "55" + formattedPhone;
    }

    console.log(`Sending to ${formattedPhone} via instance ${instanceName}`);

    // Send message via Evolution API
    let evolutionResponse;
    
    if (messageType === "text") {
      evolutionResponse = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolutionApiKey,
        },
        body: JSON.stringify({
          number: formattedPhone,
          text: content,
        }),
      });
    } else if (messageType === "image" && mediaUrl) {
      evolutionResponse = await fetch(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolutionApiKey,
        },
        body: JSON.stringify({
          number: formattedPhone,
          mediatype: "image",
          media: mediaUrl,
          caption: content,
        }),
      });
    } else if (messageType === "document" && mediaUrl) {
      evolutionResponse = await fetch(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolutionApiKey,
        },
        body: JSON.stringify({
          number: formattedPhone,
          mediatype: "document",
          media: mediaUrl,
          caption: content,
        }),
      });
    } else if (messageType === "audio" && mediaUrl) {
      evolutionResponse = await fetch(`${evolutionApiUrl}/message/sendWhatsAppAudio/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolutionApiKey,
        },
        body: JSON.stringify({
          number: formattedPhone,
          audio: mediaUrl,
        }),
      });
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Unsupported message type or missing media URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const evolutionResult = await evolutionResponse.json();
    console.log("Evolution API response:", JSON.stringify(evolutionResult));

    if (!evolutionResponse.ok) {
      console.error("Evolution API error:", evolutionResult);
      return new Response(
        JSON.stringify({ success: false, error: evolutionResult.message || "Failed to send message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save message to database
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content,
        sender_id: user.id,
        sender_type: "agent",
        message_type: messageType,
        media_url: mediaUrl || null,
      })
      .select()
      .single();

    if (msgError) {
      console.error("Error saving message:", msgError);
      // Message was sent but not saved - still return success
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: "Message sent but not saved to database",
          evolutionResult 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Message sent and saved: ${message.id}`);

    return new Response(
      JSON.stringify({ success: true, message, evolutionResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in send-whatsapp:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
