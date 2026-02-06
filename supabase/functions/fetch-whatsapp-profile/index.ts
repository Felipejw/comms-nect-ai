import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { contactId, phone } = body;

    let cleanPhone: string;
    
    if (phone) {
      cleanPhone = phone.replace(/\D/g, "");
    } else if (contactId) {
      const { data: contact, error: contactError } = await supabaseClient
        .from("contacts")
        .select("id, phone, avatar_url")
        .eq("id", contactId)
        .single();

      if (contactError || !contact) {
        return new Response(
          JSON.stringify({ success: false, error: "Contato não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!contact.phone) {
        return new Response(
          JSON.stringify({ success: false, error: "Contato sem telefone" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      cleanPhone = contact.phone.replace(/\D/g, "");
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "contactId ou phone é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Baileys server config from system_settings
    const { data: urlSetting } = await supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_server_url")
      .single();

    const { data: keySetting } = await supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_key")
      .single();

    const baileysUrl = urlSetting?.value;
    const baileysApiKey = keySetting?.value;

    if (!baileysUrl) {
      console.log("Baileys server not configured, returning basic response");
      return new Response(
        JSON.stringify({ success: true, status: 'offline', lastSeen: null, avatarUrl: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get active WhatsApp connection
    const { data: connection, error: connError } = await supabaseClient
      .from("connections")
      .select("*")
      .eq("type", "whatsapp")
      .eq("status", "connected")
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ success: true, status: 'offline', lastSeen: null, avatarUrl: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionData = connection.session_data as Record<string, unknown> | null;
    const sessionName = (sessionData?.sessionName as string) || connection.name.toLowerCase().replace(/\s+/g, "_");
    
    console.log(`Fetching WhatsApp profile for ${cleanPhone} via Baileys session ${sessionName}`);

    const result: Record<string, unknown> = { success: true };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (baileysApiKey) headers["X-API-Key"] = baileysApiKey;

    // Try to fetch profile picture from Baileys
    try {
      const profileResponse = await fetch(
        `${baileysUrl}/sessions/${sessionName}/profile-picture`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ phone: cleanPhone }),
        }
      );

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        result.avatarUrl = profileData?.data?.url || profileData?.url || null;
        
        if (contactId && result.avatarUrl) {
          await supabaseClient
            .from("contacts")
            .update({ avatar_url: result.avatarUrl as string })
            .eq("id", contactId);
        }
      } else {
        console.log("Profile picture endpoint returned:", profileResponse.status);
        result.avatarUrl = null;
      }
    } catch (e) {
      console.error("Error fetching profile picture:", e);
      result.avatarUrl = null;
    }

    // Presence/status - Baileys may not expose this via HTTP endpoint
    // Default to offline as presence requires WebSocket subscription
    result.status = 'offline';
    result.lastSeen = null;

    console.log(`Profile fetch complete for ${cleanPhone}:`, result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fetch-whatsapp-profile:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro interno",
        status: 'offline',
        lastSeen: null
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
