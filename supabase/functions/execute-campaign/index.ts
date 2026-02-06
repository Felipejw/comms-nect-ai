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
  retried: number;
  completed: boolean;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function substituteVariables(message: string, contact: { name?: string; phone?: string }): string {
  let result = message;
  result = result.replace(/\{\{nome\}\}/gi, contact.name || 'Cliente');
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone || '');
  return result;
}

function getNextRetryTime(retryCount: number): Date {
  const delayMinutes = Math.pow(3, retryCount) * 5;
  const nextRetry = new Date();
  nextRetry.setMinutes(nextRetry.getMinutes() + delayMinutes);
  return nextRetry;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting campaign execution...");

    // Load Baileys config from system_settings
    const { data: urlSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_server_url")
      .single();

    const { data: keySetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_key")
      .single();

    const baileysUrl = urlSetting?.value;
    const baileysApiKey = keySetting?.value;

    if (!baileysUrl) {
      console.error("Baileys server URL not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Baileys server URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get active campaigns
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

    const sessionData = connection.session_data as Record<string, unknown> | null;
    const sessionName = (sessionData?.sessionName as string) || connection.name.toLowerCase().replace(/\s+/g, "_");
    console.log(`Using WhatsApp session: ${sessionName}`);

    // Verify connection is actually connected via Baileys
    try {
      const healthHeaders: Record<string, string> = {};
      if (baileysApiKey) healthHeaders["X-API-Key"] = baileysApiKey;
      
      const statusCheck = await fetch(`${baileysUrl}/sessions/${sessionName}/status`, {
        headers: healthHeaders,
      });
      const statusResult = await statusCheck.json();
      
      if (!statusResult.success || statusResult.data?.status !== 'connected') {
        console.log(`Session ${sessionName} is not connected:`, statusResult);
        await supabase.from("connections").update({ status: 'disconnected' }).eq("id", connection.id);
        
        return new Response(
          JSON.stringify({ success: false, error: "WhatsApp disconnected" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (statusError) {
      console.error("Error checking connection status:", statusError);
    }

    const baileysHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (baileysApiKey) baileysHeaders["X-API-Key"] = baileysApiKey;

    const results: CampaignResult[] = [];

    for (const campaign of campaigns) {
      console.log(`Processing campaign: ${campaign.name} (${campaign.id})`);

      const minInterval = campaign.min_interval || 30;
      const maxInterval = campaign.max_interval || 60;
      const useVariations = campaign.use_variations || false;
      const messageVariations = campaign.message_variations || [];

      // Get pending contacts (limit to 10 per execution to avoid timeout)
      const { data: pendingContacts, error: contactsError } = await supabase
        .from("campaign_contacts")
        .select(`*, contact:contacts (id, name, phone, whatsapp_lid)`)
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .limit(10);

      if (contactsError) {
        console.error(`Error fetching contacts for campaign ${campaign.id}:`, contactsError);
        continue;
      }

      // Get contacts for retry
      const { data: retryContacts, error: retryError } = await supabase
        .from("campaign_contacts")
        .select(`*, contact:contacts (id, name, phone, whatsapp_lid)`)
        .eq("campaign_id", campaign.id)
        .eq("status", "failed")
        .lt("retry_count", 3)
        .or("next_retry_at.is.null,next_retry_at.lte.now()")
        .limit(5);

      if (retryError) {
        console.error(`Error fetching retry contacts for campaign ${campaign.id}:`, retryError);
      }

      const allContacts = [...(pendingContacts || []), ...(retryContacts || [])];

      if (allContacts.length === 0) {
        console.log(`No pending or retry contacts for campaign ${campaign.id}`);
        
        const { count: remainingCount } = await supabase
          .from("campaign_contacts")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .or("status.eq.pending,and(status.eq.failed,retry_count.lt.3)");

        if (remainingCount === 0) {
          await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
          console.log(`Campaign ${campaign.id} marked as completed`);
          results.push({
            campaign_id: campaign.id, campaign_name: campaign.name,
            processed: 0, sent: 0, failed: 0, retried: 0, completed: true
          });
        }
        continue;
      }

      let sentCount = 0;
      let failedCount = 0;
      let retriedCount = 0;

      for (const campaignContact of allContacts) {
        const contact = campaignContact.contact;
        const isRetry = campaignContact.status === "failed";
        
        if (isRetry) retriedCount++;
        
        if (!contact) {
          await supabase.from("campaign_contacts").update({ 
            status: "failed", last_error: "Contact not found", retry_count: 3
          }).eq("id", campaignContact.id);
          failedCount++;
          continue;
        }

        // Determine phone number to use (supports LID via Baileys)
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
          await supabase.from("campaign_contacts").update({ 
            status: "failed", last_error: "No valid phone number", retry_count: 3
          }).eq("id", campaignContact.id);
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

        // Select message content
        let baseMessage = campaign.message;
        if (useVariations && messageVariations.length > 0) {
          const allMessages = [campaign.message, ...messageVariations.filter(Boolean)];
          baseMessage = allMessages[Math.floor(Math.random() * allMessages.length)];
        }

        const messageContent = substituteVariables(baseMessage, {
          name: contact.name, phone: contact.phone
        });

        console.log(`Sending to ${formattedNumber}: ${messageContent.substring(0, 50)}...`);

        try {
          let baileysResponse;
          
          if (campaign.media_url) {
            const mediaType = campaign.media_type || "image";
            
            baileysResponse = await fetch(`${baileysUrl}/sessions/${sessionName}/send/media`, {
              method: "POST",
              headers: baileysHeaders,
              body: JSON.stringify({
                to: formattedNumber,
                mediaUrl: campaign.media_url,
                caption: messageContent,
                mediaType,
              }),
            });
          } else {
            baileysResponse = await fetch(`${baileysUrl}/sessions/${sessionName}/send/text`, {
              method: "POST",
              headers: baileysHeaders,
              body: JSON.stringify({
                to: formattedNumber,
                text: messageContent,
              }),
            });
          }

          const baileysResult = await baileysResponse.json();
          console.log(`Baileys response for ${formattedNumber}:`, JSON.stringify(baileysResult).substring(0, 200));

          if (baileysResponse.ok && baileysResult.success) {
            await supabase.from("campaign_contacts").update({ 
              status: "sent", sent_at: new Date().toISOString(),
              last_error: null, next_retry_at: null
            }).eq("id", campaignContact.id);
            sentCount++;
          } else {
            const errorMessage = baileysResult?.error || baileysResult?.message || "Unknown error";
            const currentRetryCount = (campaignContact.retry_count || 0) + 1;
            
            await supabase.from("campaign_contacts").update({ 
              status: "failed",
              last_error: String(errorMessage).substring(0, 500),
              retry_count: currentRetryCount,
              next_retry_at: currentRetryCount < 3 ? getNextRetryTime(currentRetryCount).toISOString() : null
            }).eq("id", campaignContact.id);
            failedCount++;
          }
        } catch (sendError) {
          console.error(`Error sending to ${formattedNumber}:`, sendError);
          const errorMessage = sendError instanceof Error ? sendError.message : "Network error";
          const currentRetryCount = (campaignContact.retry_count || 0) + 1;
          
          await supabase.from("campaign_contacts").update({ 
            status: "failed",
            last_error: errorMessage.substring(0, 500),
            retry_count: currentRetryCount,
            next_retry_at: currentRetryCount < 3 ? getNextRetryTime(currentRetryCount).toISOString() : null
          }).eq("id", campaignContact.id);
          failedCount++;
        }

        const delay = (minInterval + Math.random() * (maxInterval - minInterval)) * 1000;
        console.log(`Waiting ${Math.round(delay)}ms before next message...`);
        await sleep(delay);
      }

      // Update campaign counters
      const { data: currentCampaign } = await supabase
        .from("campaigns")
        .select("sent_count, failed_count")
        .eq("id", campaign.id)
        .single();

      await supabase.from("campaigns").update({ 
        sent_count: (currentCampaign?.sent_count || 0) + sentCount,
        failed_count: (currentCampaign?.failed_count || 0) + failedCount
      }).eq("id", campaign.id);

      // Check if campaign is now complete
      const { count: remainingPending } = await supabase
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .or("status.eq.pending,and(status.eq.failed,retry_count.lt.3)");

      const isCompleted = remainingPending === 0;
      
      if (isCompleted) {
        await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
        console.log(`Campaign ${campaign.id} completed!`);
      }

      results.push({
        campaign_id: campaign.id, campaign_name: campaign.name,
        processed: allContacts.length, sent: sentCount, failed: failedCount,
        retried: retriedCount, completed: isCompleted
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
