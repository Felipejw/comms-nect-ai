import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CampaignResult {
  campaign_id: string;
  campaign_name: string;
  processed: number;
  sent: number;
  failed: number;
  completed: boolean;
}

// Helper function to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to substitute variables in message
function substituteVariables(message: string, contact: { name?: string; phone?: string }): string {
  let result = message;
  result = result.replace(/\{\{nome\}\}/gi, contact.name || 'Cliente');
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone || '');
  return result;
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

    console.log("Starting campaign execution...");

    // Get active campaigns that are scheduled to run (or have no schedule)
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "active")
      .or("scheduled_at.is.null,scheduled_at.lte.now()");

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      throw new Error(`Failed to fetch campaigns: ${campaignsError.message}`);
    }

    if (!campaigns || campaigns.length === 0) {
      console.log("No active campaigns to process");
      return new Response(
        JSON.stringify({ success: true, message: "No active campaigns", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${campaigns.length} active campaigns`);

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
    console.log(`Using WhatsApp instance: ${instanceName}`);

    // Verify connection is actually connected
    try {
      const statusCheck = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
        headers: { "apikey": evolutionApiKey }
      });
      const statusResult = await statusCheck.json();
      const connectionState = statusResult?.instance?.state || statusResult?.state;
      
      if (connectionState !== 'open') {
        console.log(`Instance ${instanceName} is not connected (state: ${connectionState})`);
        await supabase.from("connections").update({ status: 'disconnected' }).eq("id", connection.id);
        
        return new Response(
          JSON.stringify({ success: false, error: "WhatsApp disconnected" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (statusError) {
      console.error("Error checking connection status:", statusError);
    }

    const results: CampaignResult[] = [];

    for (const campaign of campaigns) {
      console.log(`Processing campaign: ${campaign.name} (${campaign.id})`);

      // Get pending contacts for this campaign (limit to 10 per execution to avoid timeout)
      const { data: pendingContacts, error: contactsError } = await supabase
        .from("campaign_contacts")
        .select(`
          *,
          contact:contacts (id, name, phone, whatsapp_lid)
        `)
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .limit(10);

      if (contactsError) {
        console.error(`Error fetching contacts for campaign ${campaign.id}:`, contactsError);
        continue;
      }

      if (!pendingContacts || pendingContacts.length === 0) {
        console.log(`No pending contacts for campaign ${campaign.id}`);
        
        // Check if all contacts have been processed
        const { count: remainingCount } = await supabase
          .from("campaign_contacts")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "pending");

        if (remainingCount === 0) {
          // Mark campaign as completed
          await supabase
            .from("campaigns")
            .update({ status: "completed" })
            .eq("id", campaign.id);
          
          console.log(`Campaign ${campaign.id} marked as completed`);
          results.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            processed: 0,
            sent: 0,
            failed: 0,
            completed: true
          });
        }
        continue;
      }

      let sentCount = 0;
      let failedCount = 0;

      for (const campaignContact of pendingContacts) {
        const contact = campaignContact.contact;
        
        if (!contact) {
          console.log(`Contact not found for campaign_contact ${campaignContact.id}`);
          await supabase
            .from("campaign_contacts")
            .update({ status: "failed" })
            .eq("id", campaignContact.id);
          failedCount++;
          continue;
        }

        // Determine phone number to use
        const phone = contact.phone;
        const whatsappLid = contact.whatsapp_lid;
        
        let phoneToSend: string | null = null;
        let sendAsLid = false;

        if (phone && phone !== whatsappLid && phone.length >= 10 && phone.length <= 15) {
          phoneToSend = phone;
        } else if (whatsappLid) {
          phoneToSend = whatsappLid;
          sendAsLid = true;
        } else if (phone) {
          phoneToSend = phone;
          const cleanPhone = phone.replace(/\D/g, "");
          sendAsLid = cleanPhone.length > 13;
        }

        if (!phoneToSend) {
          console.log(`No valid phone for contact ${contact.id}`);
          await supabase
            .from("campaign_contacts")
            .update({ status: "failed" })
            .eq("id", campaignContact.id);
          failedCount++;
          continue;
        }

        // Format number
        let formattedNumber = phoneToSend.replace(/\D/g, "");
        if (sendAsLid) {
          formattedNumber = `${formattedNumber}@lid`;
        } else if (!formattedNumber.startsWith("55") && formattedNumber.length <= 11) {
          formattedNumber = "55" + formattedNumber;
        }

        // Substitute variables in message
        const messageContent = substituteVariables(campaign.message, {
          name: contact.name,
          phone: contact.phone
        });

        console.log(`Sending to ${formattedNumber}: ${messageContent.substring(0, 50)}...`);

        try {
          // Send text message
          let evolutionResponse;
          
          if (campaign.media_url) {
            // Send with media
            evolutionResponse = await fetch(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": evolutionApiKey,
              },
              body: JSON.stringify({
                number: formattedNumber,
                mediatype: "image",
                media: campaign.media_url,
                caption: messageContent,
              }),
            });
          } else {
            // Send text only
            evolutionResponse = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": evolutionApiKey,
              },
              body: JSON.stringify({
                number: formattedNumber,
                text: messageContent,
              }),
            });
          }

          const evolutionResult = await evolutionResponse.json();
          console.log(`Evolution response for ${formattedNumber}:`, JSON.stringify(evolutionResult).substring(0, 200));

          if (evolutionResponse.ok) {
            // Update campaign_contact as sent
            await supabase
              .from("campaign_contacts")
              .update({ 
                status: "sent",
                sent_at: new Date().toISOString()
              })
              .eq("id", campaignContact.id);
            sentCount++;
            console.log(`Message sent to ${formattedNumber}`);
          } else {
            // Mark as failed
            await supabase
              .from("campaign_contacts")
              .update({ status: "failed" })
              .eq("id", campaignContact.id);
            failedCount++;
            console.log(`Failed to send to ${formattedNumber}:`, evolutionResult);
          }
        } catch (sendError) {
          console.error(`Error sending to ${formattedNumber}:`, sendError);
          await supabase
            .from("campaign_contacts")
            .update({ status: "failed" })
            .eq("id", campaignContact.id);
          failedCount++;
        }

        // Random delay between 2-5 seconds to avoid rate limiting
        const delay = 2000 + Math.random() * 3000;
        console.log(`Waiting ${Math.round(delay)}ms before next message...`);
        await sleep(delay);
      }

      // Update campaign counters
      const { data: currentCampaign } = await supabase
        .from("campaigns")
        .select("sent_count, failed_count")
        .eq("id", campaign.id)
        .single();

      await supabase
        .from("campaigns")
        .update({ 
          sent_count: (currentCampaign?.sent_count || 0) + sentCount,
          failed_count: (currentCampaign?.failed_count || 0) + failedCount
        })
        .eq("id", campaign.id);

      // Check if campaign is now complete
      const { count: remainingPending } = await supabase
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("status", "pending");

      const isCompleted = remainingPending === 0;
      
      if (isCompleted) {
        await supabase
          .from("campaigns")
          .update({ status: "completed" })
          .eq("id", campaign.id);
        console.log(`Campaign ${campaign.id} completed!`);
      }

      results.push({
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        processed: pendingContacts.length,
        sent: sentCount,
        failed: failedCount,
        completed: isCompleted
      });
    }

    console.log("Campaign execution completed:", JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in execute-campaign:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
