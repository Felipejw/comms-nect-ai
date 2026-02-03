import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResolveLidPayload {
  contactId: string;
  whatsappLid?: string;
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get Baileys server URL from settings
    const { data: baileysUrlSetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_server_url")
      .single();

    const { data: baileysApiKeySetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_key")
      .single();

    const baileysUrl = baileysUrlSetting?.value;
    const baileysApiKey = baileysApiKeySetting?.value;

    if (!baileysUrl) {
      console.error("Baileys server URL not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Baileys server URL não configurada em Configurações do Sistema" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: ResolveLidPayload = await req.json();
    const { contactId, whatsappLid } = payload;

    if (!contactId) {
      return new Response(
        JSON.stringify({ success: false, error: "contactId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[resolve-lid] Resolving LID for contact ${contactId}, LID: ${whatsappLid}`);

    // Get contact from database
    const { data: contact, error: contactError } = await supabaseAdmin
      .from("contacts")
      .select("id, name, phone, whatsapp_lid")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      console.error("Contact not found:", contactError);
      return new Response(
        JSON.stringify({ success: false, error: "Contato não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lidToResolve = whatsappLid || contact.whatsapp_lid || contact.phone;
    
    if (!lidToResolve) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum LID disponível para resolver" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean LID
    const cleanLid = lidToResolve.replace(/[@:]/g, '').replace(/lid/gi, '').replace(/\D/g, '');
    console.log(`[resolve-lid] Clean LID: ${cleanLid}`);

    // Get active WhatsApp connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from("connections")
      .select("*")
      .eq("type", "whatsapp")
      .eq("status", "connected")
      .order("is_default", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      console.error("No active connection:", connError);
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma conexão WhatsApp ativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionData = connection.session_data as SessionData;
    const sessionName = sessionData?.sessionName || sessionData?.instanceName || connection.name.toLowerCase().replace(/\s+/g, "_");

    console.log(`[resolve-lid] Using session ${sessionName} to resolve LID`);

    // Build headers for Baileys API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (baileysApiKey) {
      headers['X-API-Key'] = baileysApiKey;
    }

    let realPhone: string | null = null;

    // Method 1: Try the resolve-lid endpoint
    try {
      console.log(`[resolve-lid] Trying Baileys resolve-lid endpoint...`);
      const resolveResponse = await fetch(`${baileysUrl}/sessions/${sessionName}/resolve-lid/${cleanLid}`, {
        method: "GET",
        headers,
      });
      
      console.log(`[resolve-lid] resolve-lid response status: ${resolveResponse.status}`);
      
      if (resolveResponse.ok) {
        const resolveData = await resolveResponse.json();
        console.log(`[resolve-lid] resolve-lid response:`, JSON.stringify(resolveData));
        
        // Extract real phone from response
        const phone = resolveData.data?.phone || resolveData.phone || resolveData.number;
        if (phone && phone.length >= 10 && phone.length <= 15) {
          realPhone = phone.replace(/\D/g, '');
          console.log(`[resolve-lid] Found real phone via resolve-lid: ${realPhone}`);
        }
      }
    } catch (resolveErr) {
      console.error("[resolve-lid] Error in resolve-lid:", resolveErr);
    }

    // Method 2: Fetch all contacts and search by LID
    if (!realPhone) {
      try {
        console.log(`[resolve-lid] Trying get-all-contacts endpoint...`);
        const allContactsResponse = await fetch(`${baileysUrl}/sessions/${sessionName}/contacts`, {
          method: "GET",
          headers,
        });
        
        if (allContactsResponse.ok) {
          const contactResult = await allContactsResponse.json();
          const contactsArray = Array.isArray(contactResult.data) ? contactResult.data : 
                                Array.isArray(contactResult) ? contactResult : [];
          
          console.log(`[resolve-lid] Fetched ${contactsArray.length} contacts`);
          
          // Find contact by LID
          // deno-lint-ignore no-explicit-any
          const lidContact = contactsArray.find((c: any) => {
            const cid = c.id || c.remoteJid || "";
            return cid.includes(cleanLid) || cid.includes(`${cleanLid}@lid`);
          });
          
          if (lidContact) {
            console.log(`[resolve-lid] Found LID contact:`, JSON.stringify(lidContact));
            const pushName = lidContact.name || lidContact.pushName || lidContact.notify || '';
            
            // Try to find a contact with same pushName and real number
            if (pushName) {
              // deno-lint-ignore no-explicit-any
              const linkedContact = contactsArray.find((c: any) => {
                const cName = c.name || c.pushName || c.notify || '';
                const cJid = c.id || c.remoteJid || '';
                return cName === pushName && cJid.includes('@s.whatsapp.net');
              });
              
              if (linkedContact) {
                const phone = (linkedContact.id || linkedContact.remoteJid || '').replace('@s.whatsapp.net', '');
                if (phone && phone.length >= 10 && phone.length <= 15) {
                  realPhone = phone;
                  console.log(`[resolve-lid] Found real phone via pushName matching: ${realPhone}`);
                }
              }
            }
          }
        }
      } catch (allContactsErr) {
        console.error("[resolve-lid] Error fetching all contacts:", allContactsErr);
      }
    }

    // Method 3: Check if the LID itself might be a valid phone number
    if (!realPhone) {
      try {
        if (cleanLid.length >= 10 && cleanLid.length <= 15) {
          console.log(`[resolve-lid] LID might be a phone, checking validity...`);
          
          const checkResponse = await fetch(`${baileysUrl}/sessions/${sessionName}/check-number/${cleanLid}`, {
            method: "GET",
            headers,
          });
          
          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            console.log(`[resolve-lid] check-number response:`, JSON.stringify(checkData));
            
            if (checkData.data?.exists || checkData.exists || checkData.success) {
              realPhone = cleanLid;
              console.log(`[resolve-lid] LID is a valid WhatsApp number: ${realPhone}`);
            }
          }
        }
      } catch (checkErr) {
        console.error("[resolve-lid] Error checking number validity:", checkErr);
      }
    }

    // If we found a real phone, update the contact
    if (realPhone) {
      console.log(`[resolve-lid] Updating contact ${contactId} with real phone: ${realPhone}`);
      
      const { error: updateError } = await supabaseAdmin
        .from("contacts")
        .update({ phone: realPhone })
        .eq("id", contactId);
      
      if (updateError) {
        console.error("[resolve-lid] Error updating contact:", updateError);
      } else {
        console.log(`[resolve-lid] Contact ${contactId} updated successfully`);
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          realPhone,
          message: `Número real encontrado: ${realPhone}` 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[resolve-lid] Could not find real phone for LID ${cleanLid}`);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Não foi possível encontrar o número real do contato. O contato precisa enviar uma nova mensagem para que o sistema capture o número.",
        realPhone: null
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[resolve-lid] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro interno" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
