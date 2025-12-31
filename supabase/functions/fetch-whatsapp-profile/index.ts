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
    const { contactId } = await req.json();

    if (!contactId) {
      return new Response(
        JSON.stringify({ success: false, error: "contactId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get contact
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
    
    // Clean phone number (remove non-digits)
    const cleanPhone = contact.phone.replace(/\D/g, "");
    
    console.log(`Fetching profile picture for ${cleanPhone} via instance ${instanceName}`);

    // Call Evolution API to get profile picture
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

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.error("Evolution API error:", profileResponse.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao buscar foto do WhatsApp" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profileData = await profileResponse.json();
    console.log("Profile picture response:", profileData);

    const avatarUrl = profileData?.profilePictureUrl || profileData?.picture || null;

    if (!avatarUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Foto de perfil não disponível" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update contact with avatar URL
    const { error: updateError } = await supabaseClient
      .from("contacts")
      .update({ avatar_url: avatarUrl })
      .eq("id", contactId);

    if (updateError) {
      console.error("Failed to update contact:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao salvar foto" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully updated avatar for contact ${contactId}`);

    return new Response(
      JSON.stringify({ success: true, avatarUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fetch-whatsapp-profile:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro interno" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
