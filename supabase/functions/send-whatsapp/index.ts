import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendMessagePayload {
  conversationId: string;
  content: string;
  messageType?: "text" | "image" | "audio" | "document" | "video";
  mediaUrl?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY")!;

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
    
    // Determine which identifier to use and how to format it
    // LID detection: phone === whatsapp_lid OR phone is very long (14+ digits with no valid country code)
    const isPhoneActuallyLid = phone && whatsappLid && phone === whatsappLid;
    const hasRealPhone = phone && phone !== whatsappLid && phone.length >= 10 && phone.length <= 15;
    
    let phoneToSend: string | null = null;
    let sendAsLid = false;
    
    if (hasRealPhone) {
      // We have a real phone number, use it
      phoneToSend = phone;
      console.log(`Using real phone number: ${phoneToSend}`);
    } else if (whatsappLid) {
      // Only have LID - need to try to find real phone number first
      console.log(`Contact only has LID: ${whatsappLid}, trying to find real phone via Evolution API...`);
      
      // Get connection first to query Evolution API
      const { data: tempConnection } = await supabaseAdmin
        .from("connections")
        .select("*")
        .eq("type", "whatsapp")
        .eq("status", "connected")
        .order("is_default", { ascending: false })
        .limit(1)
        .single();
      
      if (tempConnection) {
        const tempInstanceName = tempConnection.session_data?.instanceName || tempConnection.name;
        
        try {
          // Try to fetch contacts from Evolution API to find real phone
          const contactsResponse = await fetch(`${evolutionApiUrl}/chat/fetchAllContacts/${tempInstanceName}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": evolutionApiKey,
            },
            body: JSON.stringify({}),
          });
          
          if (contactsResponse.ok) {
            const contactsData = await contactsResponse.json();
            const contactsArray = Array.isArray(contactsData) ? contactsData : contactsData?.contacts || [];
            
            console.log(`Fetched ${contactsArray.length} contacts from Evolution API`);
            
            // Find contact by LID
            const lidContact = contactsArray.find((c: any) => {
              const remoteJid = c.remoteJid || c.id || "";
              const remoteLid = remoteJid.replace("@lid", "").replace("@s.whatsapp.net", "").split(":")[0];
              return remoteLid === whatsappLid || remoteJid.includes(whatsappLid);
            });
            
            if (lidContact) {
              console.log(`Found LID contact in Evolution:`, JSON.stringify(lidContact));
              
              // Check if this contact has remoteJidAlt with real phone
              if (lidContact.remoteJidAlt && lidContact.remoteJidAlt.includes("@s.whatsapp.net")) {
                const realPhone = lidContact.remoteJidAlt.replace("@s.whatsapp.net", "");
                if (realPhone.length >= 10 && realPhone.length <= 15) {
                  console.log(`Found real phone via remoteJidAlt: ${realPhone}`);
                  phoneToSend = realPhone;
                  sendAsLid = false;
                  
                  // Update contact with real phone
                  await supabaseAdmin
                    .from("contacts")
                    .update({ phone: realPhone })
                    .eq("id", contact.id);
                  console.log(`Updated contact ${contact.id} with real phone: ${realPhone}`);
                }
              }
              
              // If still no phone, try to find via pushName match
              if (!phoneToSend && lidContact.pushName) {
                const matchingContact = contactsArray.find((c: any) => 
                  c.pushName === lidContact.pushName && 
                  c.remoteJid?.includes("@s.whatsapp.net") &&
                  !c.remoteJid?.includes("@lid")
                );
                
                if (matchingContact) {
                  const realPhone = matchingContact.remoteJid.replace("@s.whatsapp.net", "");
                  if (realPhone.length >= 10 && realPhone.length <= 15) {
                    console.log(`Found real phone via pushName match: ${realPhone}`);
                    phoneToSend = realPhone;
                    sendAsLid = false;
                    
                    // Update contact with real phone
                    await supabaseAdmin
                      .from("contacts")
                      .update({ phone: realPhone })
                      .eq("id", contact.id);
                    console.log(`Updated contact ${contact.id} with real phone: ${realPhone}`);
                  }
                }
              }
            }
          }
        } catch (fetchErr) {
          console.error("Error fetching contacts from Evolution:", fetchErr);
        }
      }
      
      // If we still don't have a real phone, we can't send
      if (!phoneToSend) {
        console.log(`Could not find real phone for LID ${whatsappLid}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Não foi possível encontrar o número real do contato. Este contato foi identificado apenas pelo ID interno do WhatsApp (LID). Por favor, peça ao contato para enviar uma nova mensagem para que o sistema possa capturar o número correto.`,
            needsReconnection: false
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (phone) {
      // Fallback to whatever we have
      phoneToSend = phone;
      // Check if it looks like a LID (long number without valid country code)
      const cleanPhone = phone.replace(/\D/g, "");
      sendAsLid = cleanPhone.length > 13 || (cleanPhone.length >= 12 && !cleanPhone.match(/^(55|1|44|351|34|49|33|39|81|86|91)/));
      
      if (sendAsLid) {
        // If it looks like a LID, we can't send
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Não foi possível enviar mensagem. O contato possui apenas um identificador interno do WhatsApp (LID) e não o número real. Por favor, peça ao contato para enviar uma nova mensagem.`,
            needsReconnection: false
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`Using phone as fallback: ${phoneToSend}`);
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Contato sem número de telefone ou ID do WhatsApp" }),
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

    const instanceName = connection.session_data?.instanceName || connection.name;

    // Verify real connection status before sending
    console.log(`Checking real status of instance ${instanceName}...`);
    try {
      const statusCheck = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
        headers: { "apikey": evolutionApiKey }
      });
      const statusResult = await statusCheck.json();
      console.log(`Instance ${instanceName} status:`, JSON.stringify(statusResult));
      
      const connectionState = statusResult?.instance?.state || statusResult?.state;
      if (connectionState !== 'open') {
        console.log(`Instance ${instanceName} is not connected (state: ${connectionState}), updating database...`);
        
        // Update database to reflect disconnection
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
      // Continue anyway, the send will fail if there's actually a problem
    }

    // Format the number based on whether it's a LID or real phone
    let formattedNumber = phoneToSend!.replace(/\D/g, "");
    
    if (sendAsLid) {
      // For LIDs, append @lid suffix
      formattedNumber = `${formattedNumber}@lid`;
      console.log(`Sending to LID: ${formattedNumber}`);
    } else {
      // For real phone numbers, add country code if needed
      if (!formattedNumber.startsWith("55") && formattedNumber.length <= 11) {
        formattedNumber = "55" + formattedNumber;
      }
      console.log(`Sending to phone: ${formattedNumber}`);
    }

    console.log(`Sending via instance ${instanceName}`);

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
          number: formattedNumber,
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
          number: formattedNumber,
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
          number: formattedNumber,
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
          number: formattedNumber,
          audio: mediaUrl,
        }),
      });
    } else if (messageType === "video" && mediaUrl) {
      console.log(`Sending video to ${formattedNumber}`);
      evolutionResponse = await fetch(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolutionApiKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          mediatype: "video",
          media: mediaUrl,
          caption: content,
        }),
      });
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Tipo de mensagem não suportado ou URL de mídia ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const evolutionResult = await evolutionResponse.json();
    console.log("Evolution API response:", JSON.stringify(evolutionResult));

    if (!evolutionResponse.ok) {
      console.error("Evolution API error:", evolutionResult);
      
      // Check for specific error types
      let errorMessage = evolutionResult.message || "Falha ao enviar mensagem";
      let needsReconnection = false;
      
      // Check for session errors (WhatsApp disconnected)
      const responseMessage = evolutionResult.response?.message || evolutionResult.message || "";
      if (typeof responseMessage === "string" && 
          (responseMessage.includes("No sessions") || 
           responseMessage.includes("Session not found") ||
           responseMessage.includes("not connected"))) {
        console.log(`Session error detected for instance ${instanceName}, marking as disconnected...`);
        
        // Update database to reflect disconnection
        await supabaseAdmin
          .from("connections")
          .update({ status: 'disconnected' })
          .eq("id", connection.id);
        
        errorMessage = "Sessão do WhatsApp expirou. Reconecte o WhatsApp na página de Conexões.";
        needsReconnection = true;
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: errorMessage,
            needsReconnection: true,
            connectionId: connection.id 
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Check if number doesn't exist on WhatsApp
      if (evolutionResult.response?.message?.[0]?.exists === false) {
        const failedNumber = evolutionResult.response.message[0].number;
        errorMessage = `Número não encontrado no WhatsApp: ${failedNumber}. O contato pode ter trocado de número ou não estar mais no WhatsApp.`;
      }
      
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, needsReconnection }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // After successful send, try to update contact info if needed
    // Check if Evolution API returned real phone info
    const sentToNumber = evolutionResult?.key?.remoteJid;
    if (sentToNumber && contact && sendAsLid) {
      // If we sent via LID and got back a real phone number
      const returnedPhone = sentToNumber.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0];
      
      if (sentToNumber.includes('@s.whatsapp.net') && returnedPhone.length <= 15) {
        // We now have the real phone number
        console.log(`Got real phone from Evolution response: ${returnedPhone}`);
        
        // Check if there's already a contact with this phone
        const { data: existingWithPhone } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("phone", returnedPhone)
          .neq("id", contact.id)
          .single();
        
        if (existingWithPhone) {
          // There's a duplicate - merge them
          console.log(`Found duplicate contact ${existingWithPhone.id}, merging...`);
          
          // Move conversations to existing contact
          await supabaseAdmin
            .from("conversations")
            .update({ contact_id: existingWithPhone.id })
            .eq("contact_id", contact.id);
          
          // Delete the LID contact
          await supabaseAdmin
            .from("contacts")
            .delete()
            .eq("id", contact.id);
          
          console.log(`Merged contact ${contact.id} into ${existingWithPhone.id}`);
        } else {
          // Just update the phone
          await supabaseAdmin
            .from("contacts")
            .update({ 
              phone: returnedPhone,
              whatsapp_lid: phoneToSend // Store the LID we used
            })
            .eq("id", contact.id);
          
          console.log(`Updated contact ${contact.id} with real phone: ${returnedPhone}`);
        }
      }
    }

    // Save message to database
    const { data: message, error: msgError } = await supabaseAdmin
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
          warning: "Mensagem enviada mas não salva no banco de dados",
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
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
