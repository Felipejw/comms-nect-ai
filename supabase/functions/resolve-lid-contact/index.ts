import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// WPPConnect API configuration
const WPPCONNECT_API_URL = Deno.env.get("WPPCONNECT_API_URL") || Deno.env.get("EVOLUTION_API_URL");
const WPPCONNECT_SECRET_KEY = Deno.env.get("WPPCONNECT_SECRET_KEY") || Deno.env.get("EVOLUTION_API_KEY");

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

    if (!WPPCONNECT_API_URL) {
      console.error("WPPConnect API URL not configured");
      return new Response(
        JSON.stringify({ success: false, error: "WPPConnect API não configurada" }),
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
    const sessionName = sessionData?.sessionName || sessionData?.instanceName || connection.name;
    const sessionToken = sessionData?.token || WPPCONNECT_SECRET_KEY;

    console.log(`[resolve-lid] Using session ${sessionName} to resolve LID`);

    let realPhone: string | null = null;

    // WPPConnect has a dedicated endpoint for resolving LIDs
    // Try the pn-lid endpoint first
    try {
      console.log(`[resolve-lid] Trying WPPConnect pn-lid endpoint...`);
      const pnLidResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/contact/pn-lid/${cleanLid}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
        },
      });
      
      console.log(`[resolve-lid] pn-lid response status: ${pnLidResponse.status}`);
      
      if (pnLidResponse.ok) {
        const pnLidData = await pnLidResponse.json();
        console.log(`[resolve-lid] pn-lid response:`, JSON.stringify(pnLidData));
        
        // Extract real phone from response
        const phone = pnLidData.phone || pnLidData.number || pnLidData.wid?.replace('@c.us', '');
        if (phone && phone.length >= 10 && phone.length <= 15) {
          realPhone = phone;
          console.log(`[resolve-lid] Found real phone via pn-lid: ${realPhone}`);
        }
      }
    } catch (pnLidErr) {
      console.error("[resolve-lid] Error in pn-lid:", pnLidErr);
    }

    // Method 2: Try to get contact info
    if (!realPhone) {
      try {
        console.log(`[resolve-lid] Trying get-contact endpoint...`);
        const contactResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/contact/${cleanLid}@c.us`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${sessionToken}`,
          },
        });
        
        console.log(`[resolve-lid] get-contact response status: ${contactResponse.status}`);
        
        if (contactResponse.ok) {
          const contactData = await contactResponse.json();
          console.log(`[resolve-lid] get-contact response:`, JSON.stringify(contactData));
          
          const phone = contactData.id?.replace('@c.us', '') || contactData.number;
          if (phone && phone.length >= 10 && phone.length <= 15 && !phone.includes('lid')) {
            realPhone = phone;
            console.log(`[resolve-lid] Found real phone via get-contact: ${realPhone}`);
          }
        }
      } catch (contactErr) {
        console.error("[resolve-lid] Error in get-contact:", contactErr);
      }
    }

    // Method 3: Check if the LID itself is a valid phone number
    if (!realPhone) {
      try {
        if (cleanLid.length >= 10 && cleanLid.length <= 15) {
          console.log(`[resolve-lid] LID might be a phone, checking validity...`);
          
          const checkResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/check-number-status/${cleanLid}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${sessionToken}`,
            },
          });
          
          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            console.log(`[resolve-lid] check-number-status response:`, JSON.stringify(checkData));
            
            if (checkData.numberExists || checkData.status === 200 || checkData.canReceiveMessage) {
              realPhone = cleanLid;
              console.log(`[resolve-lid] LID is a valid WhatsApp number: ${realPhone}`);
            }
          }
        }
      } catch (checkErr) {
        console.error("[resolve-lid] Error checking number validity:", checkErr);
      }
    }

    // Method 4: Fetch all contacts and search
    if (!realPhone) {
      try {
        console.log(`[resolve-lid] Trying get-all-contacts endpoint...`);
        const allContactsResponse = await fetch(`${WPPCONNECT_API_URL}/api/${sessionName}/all-contacts`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${sessionToken}`,
          },
        });
        
        if (allContactsResponse.ok) {
          const allContacts = await allContactsResponse.json();
          const contactsArray = Array.isArray(allContacts) ? allContacts : allContacts.contacts || [];
          
          console.log(`[resolve-lid] Fetched ${contactsArray.length} contacts`);
          
          // Find contact by LID
          const lidContact = contactsArray.find((c: any) => {
            const cid = c.id || c.jid || "";
            const cleanCid = cid.replace('@c.us', '').replace('@lid', '').split(':')[0];
            return cleanCid === cleanLid || cid.includes(cleanLid);
          });
          
          if (lidContact) {
            console.log(`[resolve-lid] Found LID contact:`, JSON.stringify(lidContact));
            
            const phone = lidContact.id?.replace('@c.us', '') || lidContact.number;
            if (phone && phone.length >= 10 && phone.length <= 15 && !phone.includes('lid')) {
              realPhone = phone;
              console.log(`[resolve-lid] Found real phone via all-contacts: ${realPhone}`);
            }
          }
        }
      } catch (allContactsErr) {
        console.error("[resolve-lid] Error fetching all contacts:", allContactsErr);
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
