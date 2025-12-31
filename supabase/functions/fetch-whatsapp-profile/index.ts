import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error("Evolution API credentials not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Evolution API não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { contactId, phone, includeStatus = false } = body;

    let cleanPhone: string;
    
    if (phone) {
      // Direct phone number provided
      cleanPhone = phone.replace(/\D/g, "");
    } else if (contactId) {
      // Get contact from database
      const { data: contact, error: contactError } = await supabaseClient
        .from("contacts")
        .select("id, phone, avatar_url")
        .eq("id", contactId)
        .single();

      if (contactError || !contact) {
        console.error("Contact not found:", contactError);
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
      console.error("No active connection:", connError);
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma conexão WhatsApp ativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceName = (connection.session_data as any)?.instanceName || connection.name;
    
    console.log(`Fetching WhatsApp profile for ${cleanPhone} via instance ${instanceName}`);

    const result: any = { success: true };

    // Fetch profile picture
    try {
      const profileResponse = await fetch(
        `${evolutionApiUrl}/chat/fetchProfilePictureUrl/${instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evolutionApiKey,
          },
          body: JSON.stringify({
            number: cleanPhone,
          }),
        }
      );

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        result.avatarUrl = profileData?.profilePictureUrl || profileData?.picture || null;
        
        // Update contact avatar if contactId was provided
        if (contactId && result.avatarUrl) {
          await supabaseClient
            .from("contacts")
            .update({ avatar_url: result.avatarUrl })
            .eq("id", contactId);
        }
      }
    } catch (e) {
      console.error("Error fetching profile picture:", e);
    }

    // Fetch online status (presence) if requested or by default for status check
    try {
      // Try to get presence/status
      const presenceResponse = await fetch(
        `${evolutionApiUrl}/chat/fetchPresence/${instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evolutionApiKey,
          },
          body: JSON.stringify({
            number: cleanPhone,
          }),
        }
      );

      if (presenceResponse.ok) {
        const presenceData = await presenceResponse.json();
        console.log("Presence response:", presenceData);
        
        // Evolution API presence response format
        result.status = presenceData?.presence === 'available' || presenceData?.presence === 'composing' 
          ? 'online' 
          : 'offline';
        result.lastSeen = presenceData?.lastSeen || presenceData?.last_seen || null;
      } else {
        // Default to offline if can't fetch presence
        result.status = 'offline';
        result.lastSeen = null;
      }
    } catch (e) {
      console.error("Error fetching presence:", e);
      result.status = 'offline';
      result.lastSeen = null;
    }

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
