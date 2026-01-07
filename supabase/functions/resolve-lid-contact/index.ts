import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResolveLidPayload {
  contactId: string;
  whatsappLid?: string;
}

Deno.serve(async (req) => {
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const payload: ResolveLidPayload = await req.json();
    const { contactId, whatsappLid } = payload;

    if (!contactId) {
      return new Response(
        JSON.stringify({ success: false, error: "contactId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Resolving LID for contact ${contactId}, LID: ${whatsappLid}`);

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

    // Clean LID - remove any non-numeric characters except for specific patterns
    const cleanLid = lidToResolve.replace(/[@:]/g, '').replace(/lid/gi, '').replace(/\D/g, '');
    console.log(`Clean LID: ${cleanLid}`);

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

    const instanceName = (connection.session_data as any)?.instanceName || connection.name;
    console.log(`Using instance ${instanceName} to resolve LID`);

    let realPhone: string | null = null;

    // Method 1: Try findContact endpoint with LID
    try {
      console.log(`Trying findContact for LID ${cleanLid}...`);
      const findResponse = await fetch(`${evolutionApiUrl}/chat/findContact/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolutionApiKey,
        },
        body: JSON.stringify({
          numbers: [`${cleanLid}@lid`]
        }),
      });
      
      console.log(`findContact response status: ${findResponse.status}`);
      
      if (findResponse.ok) {
        const findData = await findResponse.json();
        console.log(`findContact response:`, JSON.stringify(findData));
        
        const foundContact = Array.isArray(findData) ? findData[0] : findData;
        if (foundContact?.jid && foundContact.jid.includes("@s.whatsapp.net")) {
          const phone = foundContact.jid.replace("@s.whatsapp.net", "");
          if (phone.length >= 10 && phone.length <= 15) {
            realPhone = phone;
            console.log(`Found real phone via findContact: ${realPhone}`);
          }
        }
      }
    } catch (findErr) {
      console.error("Error in findContact:", findErr);
    }

    // Method 2: Fetch all contacts and search for LID
    if (!realPhone) {
      try {
        console.log(`Trying fetchAllContacts endpoint...`);
        const contactsResponse = await fetch(`${evolutionApiUrl}/chat/fetchAllContacts/${instanceName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": evolutionApiKey,
          },
          body: JSON.stringify({}),
        });
        
        console.log(`fetchAllContacts response status: ${contactsResponse.status}`);
        
        if (contactsResponse.ok) {
          const contactsData = await contactsResponse.json();
          const contactsArray = Array.isArray(contactsData) ? contactsData : contactsData?.contacts || [];
          
          console.log(`Fetched ${contactsArray.length} contacts from Evolution API`);
          
          // Find contact by LID
          const lidContact = contactsArray.find((c: any) => {
            const remoteJid = c.remoteJid || c.id || "";
            const remoteLid = remoteJid.replace("@lid", "").replace("@s.whatsapp.net", "").split(":")[0];
            return remoteLid === cleanLid || remoteJid.includes(cleanLid);
          });
          
          if (lidContact) {
            console.log(`Found LID contact in Evolution:`, JSON.stringify(lidContact));
            
            // Check if has remoteJidAlt with real phone
            if (lidContact.remoteJidAlt && lidContact.remoteJidAlt.includes("@s.whatsapp.net")) {
              const phone = lidContact.remoteJidAlt.replace("@s.whatsapp.net", "");
              if (phone.length >= 10 && phone.length <= 15) {
                realPhone = phone;
                console.log(`Found real phone via remoteJidAlt: ${realPhone}`);
              }
            }
            
            // Try pushName match
            if (!realPhone && lidContact.pushName) {
              console.log(`Trying pushName match for "${lidContact.pushName}"...`);
              const matchingContact = contactsArray.find((c: any) => 
                c.pushName === lidContact.pushName && 
                c.remoteJid?.includes("@s.whatsapp.net") &&
                !c.remoteJid?.includes("@lid")
              );
              
              if (matchingContact) {
                const phone = matchingContact.remoteJid.replace("@s.whatsapp.net", "");
                if (phone.length >= 10 && phone.length <= 15) {
                  realPhone = phone;
                  console.log(`Found real phone via pushName match: ${realPhone}`);
                }
              }
            }
          }
        }
      } catch (fetchErr) {
        console.error("Error fetching contacts from Evolution:", fetchErr);
      }
    }

    // Method 3: Try to get profile picture (which only works with real numbers)
    // This can help verify if a potential number is valid
    if (!realPhone) {
      try {
        // Check if the LID might be a phone in disguise (10-15 digits)
        if (cleanLid.length >= 10 && cleanLid.length <= 15) {
          console.log(`LID length suggests it might be a phone number, checking...`);
          
          const checkResponse = await fetch(`${evolutionApiUrl}/chat/whatsappNumbers/${instanceName}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": evolutionApiKey,
            },
            body: JSON.stringify({
              numbers: [cleanLid]
            }),
          });
          
          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            console.log(`whatsappNumbers response:`, JSON.stringify(checkData));
            
            const validNumber = Array.isArray(checkData) && checkData[0]?.exists;
            if (validNumber) {
              realPhone = cleanLid;
              console.log(`LID is actually a valid WhatsApp number: ${realPhone}`);
            }
          }
        }
      } catch (checkErr) {
        console.error("Error checking number validity:", checkErr);
      }
    }

    // If we found a real phone, update the contact
    if (realPhone) {
      console.log(`Updating contact ${contactId} with real phone: ${realPhone}`);
      
      const { error: updateError } = await supabaseAdmin
        .from("contacts")
        .update({ phone: realPhone })
        .eq("id", contactId);
      
      if (updateError) {
        console.error("Error updating contact:", updateError);
      } else {
        console.log(`Contact ${contactId} updated successfully`);
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

    console.log(`Could not find real phone for LID ${cleanLid}`);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Não foi possível encontrar o número real do contato. O contato precisa enviar uma nova mensagem para que o sistema capture o número.",
        realPhone: null
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in resolve-lid-contact:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro interno" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
