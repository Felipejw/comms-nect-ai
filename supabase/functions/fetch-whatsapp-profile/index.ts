// ===========================================
// Fetch WhatsApp Profile - Busca foto e status via Baileys
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { contactId, phone } = body;

    if (!contactId && !phone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "contactId ou phone é obrigatório",
          status: "offline",
          lastSeen: null,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fetch-profile] Fetching profile for contactId=${contactId}, phone=${phone}`);

    // 1. Buscar contato do banco se necessário
    let targetPhone = phone;
    let targetLid: string | null = null;

    if (contactId && !phone) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("phone, whatsapp_lid")
        .eq("id", contactId)
        .maybeSingle();

      if (contact) {
        targetPhone = contact.phone;
        targetLid = contact.whatsapp_lid;
      }
    }

    if (!targetPhone && !targetLid) {
      console.log("[fetch-profile] No phone or LID found for contact");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Contato não tem telefone cadastrado",
          status: "offline",
          lastSeen: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar uma conexão ativa
    const { data: connections } = await supabase
      .from("connections")
      .select("id, name, status")
      .eq("status", "connected")
      .limit(1);

    if (!connections || connections.length === 0) {
      console.log("[fetch-profile] No active connections");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nenhuma conexão WhatsApp ativa",
          status: "offline",
          lastSeen: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const connection = connections[0];
    const sessionName = connection.name || connection.id;

    // 3. Buscar URL e API Key do Baileys
    const { data: baileysSettingsList } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["baileys_server_url", "baileys_api_key"]);

    const settingsMap = Object.fromEntries((baileysSettingsList || []).map((s: any) => [s.key, s.value]));
    const baileysUrl = settingsMap["baileys_server_url"] || "http://baileys:3001";
    const baileysApiKey = settingsMap["baileys_api_key"] || "";
    const baileysHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (baileysApiKey) baileysHeaders["X-API-Key"] = baileysApiKey;

    // 4. Montar o JID
    const jid = targetPhone
      ? `${targetPhone.replace(/\D/g, "")}@s.whatsapp.net`
      : `${targetLid}@lid`;

    console.log(`[fetch-profile] Fetching from Baileys: session=${sessionName}, jid=${jid}`);

    // 5. Buscar perfil do Baileys
    let profileData: any = {
      status: "offline",
      lastSeen: null,
      profilePicUrl: null,
      pushName: null,
    };

    try {
      const profileResponse = await fetch(
        `${baileysUrl}/api/profile/${sessionName}/${encodeURIComponent(jid)}`,
        {
          method: "GET",
          headers: baileysHeaders,
        }
      );

      if (profileResponse.ok) {
        const data = await profileResponse.json();
        profileData = {
          status: data.status || data.presence || "offline",
          lastSeen: data.lastSeen || data.last_seen || null,
          profilePicUrl: data.profilePicUrl || data.imgUrl || data.picture || null,
          pushName: data.pushName || data.name || null,
        };
        console.log(`[fetch-profile] Got profile data: status=${profileData.status}`);
      } else {
        console.warn(`[fetch-profile] Baileys returned ${profileResponse.status}`);
      }
    } catch (fetchErr) {
      console.warn(`[fetch-profile] Error fetching from Baileys:`, fetchErr);
      // Não falhar - retornar offline
    }

    // 6. Atualizar avatar no banco se obteve URL
    if (profileData.profilePicUrl && contactId) {
      await supabase
        .from("contacts")
        .update({
          avatar_url: profileData.profilePicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contactId);

      console.log(`[fetch-profile] Updated avatar for contact ${contactId}`);
    }

    // 7. Atualizar nome se pushName e o nome atual é placeholder
    if (profileData.pushName && contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("name, name_source")
        .eq("id", contactId)
        .maybeSingle();

      if (contact) {
        const badNames = ["Chatbot Whats", "Contato Desconhecido"];
        const isPlaceholder =
          badNames.includes(contact.name) ||
          contact.name === targetPhone ||
          /^\d{14,}$/.test(contact.name);

        if (isPlaceholder) {
          await supabase
            .from("contacts")
            .update({
              name: profileData.pushName,
              name_source: "whatsapp",
            })
            .eq("id", contactId);

          console.log(`[fetch-profile] Updated name to ${profileData.pushName}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: profileData.status,
        lastSeen: profileData.lastSeen,
        profilePicUrl: profileData.profilePicUrl,
        pushName: profileData.pushName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fetch-profile] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
        status: "offline",
        lastSeen: null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
