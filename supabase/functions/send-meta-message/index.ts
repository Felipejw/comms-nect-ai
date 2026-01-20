import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API_URL = "https://graph.facebook.com/v18.0";

interface SendMessageRequest {
  connectionId: string;
  to: string;
  message?: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  filename?: string;
  template?: {
    name: string;
    language: { code: string };
    components?: Array<{
      type: string;
      parameters: Array<{ type: string; text?: string; image?: { link: string } }>;
    }>;
  };
  buttons?: Array<{ type: string; reply: { id: string; title: string } }>;
}

interface MetaMessagePayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: string;
  text?: { body: string; preview_url?: boolean };
  image?: { link: string; caption?: string };
  audio?: { link: string };
  video?: { link: string; caption?: string };
  document?: { link: string; filename?: string; caption?: string };
  template?: {
    name: string;
    language: { code: string };
    components?: Array<unknown>;
  };
  interactive?: {
    type: string;
    body?: { text: string };
    action?: { buttons?: Array<{ type: string; reply: { id: string; title: string } }> };
  };
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body: SendMessageRequest = await req.json();
    const { connectionId, to, message, mediaUrl, mediaType, filename, template, buttons } = body;

    console.log("[Send Meta Message] Request:", { connectionId, to, messagePreview: message?.substring(0, 50) });

    if (!connectionId || !to) {
      return new Response(
        JSON.stringify({ error: "connectionId and to are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get connection details
    const { data: connection, error: connError } = await supabase
      .from("connections")
      .select("id, tenant_id, session_data")
      .eq("id", connectionId)
      .eq("type", "meta_api")
      .single();

    if (connError || !connection) {
      console.error("[Send Meta Message] Connection not found:", connError);
      return new Response(
        JSON.stringify({ error: "Connection not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionData = connection.session_data as {
      access_token: string;
      phone_number_id: string;
    } | null;

    if (!sessionData?.access_token || !sessionData?.phone_number_id) {
      return new Response(
        JSON.stringify({ error: "Connection missing access_token or phone_number_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number (remove + and spaces)
    const formattedTo = to.replace(/[^\d]/g, "");

    // Build message payload
    let payload: MetaMessagePayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: formattedTo,
      type: "text",
    };

    if (template) {
      // Template message
      payload.type = "template";
      payload.template = template;
    } else if (mediaUrl && mediaType) {
      // Media message
      payload.type = mediaType;
      switch (mediaType) {
        case "image":
          payload.image = { link: mediaUrl, caption: message };
          break;
        case "audio":
          payload.audio = { link: mediaUrl };
          break;
        case "video":
          payload.video = { link: mediaUrl, caption: message };
          break;
        case "document":
          payload.document = { link: mediaUrl, filename, caption: message };
          break;
      }
    } else if (buttons && buttons.length > 0) {
      // Interactive button message
      payload.type = "interactive";
      payload.interactive = {
        type: "button",
        body: { text: message || "" },
        action: { buttons },
      };
    } else if (message) {
      // Simple text message
      payload.type = "text";
      payload.text = { body: message, preview_url: true };
    } else {
      return new Response(
        JSON.stringify({ error: "No message content provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Send Meta Message] Sending to Meta API:", JSON.stringify(payload));

    // Send message via Meta API
    const metaResponse = await fetch(
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

    const metaResult = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("[Send Meta Message] Meta API error:", metaResult);
      return new Response(
        JSON.stringify({
          error: "Failed to send message",
          details: metaResult.error || metaResult,
        }),
        { status: metaResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Send Meta Message] Success:", metaResult);

    // Log activity
    await supabase.from("activity_logs").insert({
      tenant_id: connection.tenant_id,
      action: "send_message",
      entity_type: "message",
      entity_id: metaResult.messages?.[0]?.id || null,
      metadata: {
        channel: "meta_api",
        to: formattedTo,
        wamid: metaResult.messages?.[0]?.id,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        messageId: metaResult.messages?.[0]?.id,
        contacts: metaResult.contacts,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Send Meta Message] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
