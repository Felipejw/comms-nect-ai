import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionUrl || !evolutionKey) {
      return new Response(
        JSON.stringify({ error: "Evolution API not configured" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all contacts with whatsapp_lid that have invalid phone numbers (same as LID)
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, name, phone, whatsapp_lid')
      .not('whatsapp_lid', 'is', null);

    if (contactsError) {
      console.error("[UpdateLID] Error fetching contacts:", contactsError);
      throw contactsError;
    }

    console.log(`[UpdateLID] Found ${contacts?.length || 0} contacts with LID`);

    // Get an active connection to use for the API calls
    const { data: connection, error: connError } = await supabase
      .from('connections')
      .select('*')
      .eq('status', 'connected')
      .eq('type', 'whatsapp')
      .limit(1)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: "No active WhatsApp connection found" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const instanceName = (connection.session_data as Record<string, unknown>)?.instanceName as string || connection.name;
    
    const results = {
      total: contacts?.length || 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      details: [] as { id: string; name: string; oldPhone: string; newPhone: string; status: string }[]
    };

    for (const contact of contacts || []) {
      try {
        const lid = contact.whatsapp_lid;
        
        // Check if phone is already a valid number (different from LID)
        if (contact.phone && contact.phone !== lid && contact.phone.length >= 10) {
          console.log(`[UpdateLID] Skipping ${contact.name} - already has valid phone: ${contact.phone}`);
          results.skipped++;
          results.details.push({
            id: contact.id,
            name: contact.name,
            oldPhone: contact.phone,
            newPhone: contact.phone,
            status: 'skipped - already valid'
          });
          continue;
        }

        // Try to get real phone from Evolution API
        const remoteJid = `${lid}@lid`;
        console.log(`[UpdateLID] Looking up contact ${contact.name} with LID: ${remoteJid}`);

        // First, try getting contact list and find the matching LID
        const contactResponse = await fetch(`${evolutionUrl}/chat/findContacts/${instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionKey,
          },
          body: JSON.stringify({
            where: {}
          }),
        });

        if (!contactResponse.ok) {
          console.error(`[UpdateLID] API error for ${contact.name}:`, await contactResponse.text());
          results.failed++;
          results.details.push({
            id: contact.id,
            name: contact.name,
            oldPhone: contact.phone || '',
            newPhone: '',
            status: 'failed - API error'
          });
          continue;
        }

        const allContacts = await contactResponse.json();
        
        // Find the contact that matches our LID
        let realPhone: string | null = null;
        const contactsArray = Array.isArray(allContacts) ? allContacts : [];
        
        // Find the contact with matching LID remoteJid
        const matchingContact = contactsArray.find((c: any) => c.remoteJid === remoteJid);
        
        if (matchingContact) {
          console.log(`[UpdateLID] Found matching contact for ${contact.name}:`, JSON.stringify(matchingContact));
          
          // Check if there's a linked regular contact (same pushName with @s.whatsapp.net)
          if (matchingContact.pushName) {
            const linkedContact = contactsArray.find((c: any) => 
              c.pushName === matchingContact.pushName && 
              c.remoteJid?.includes('@s.whatsapp.net')
            );
            
            if (linkedContact) {
              realPhone = linkedContact.remoteJid.replace('@s.whatsapp.net', '');
              console.log(`[UpdateLID] Found linked phone via pushName: ${realPhone}`);
            }
          }
        } else {
          console.log(`[UpdateLID] No matching contact found for LID: ${remoteJid}`);
        }

        if (realPhone && realPhone !== lid) {
          // Update contact with real phone number
          const { error: updateError } = await supabase
            .from('contacts')
            .update({ phone: realPhone })
            .eq('id', contact.id);

          if (updateError) {
            console.error(`[UpdateLID] Error updating ${contact.name}:`, updateError);
            results.failed++;
            results.details.push({
              id: contact.id,
              name: contact.name,
              oldPhone: contact.phone || '',
              newPhone: '',
              status: 'failed - update error'
            });
          } else {
            console.log(`[UpdateLID] Updated ${contact.name}: ${contact.phone} -> ${realPhone}`);
            results.updated++;
            results.details.push({
              id: contact.id,
              name: contact.name,
              oldPhone: contact.phone || lid,
              newPhone: realPhone,
              status: 'updated'
            });
          }
        } else {
          console.log(`[UpdateLID] Could not find real phone for ${contact.name}`);
          results.failed++;
          results.details.push({
            id: contact.id,
            name: contact.name,
            oldPhone: contact.phone || '',
            newPhone: '',
            status: 'failed - no real phone found'
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        console.error(`[UpdateLID] Error processing contact ${contact.name}:`, err);
        results.failed++;
        results.details.push({
          id: contact.id,
          name: contact.name,
          oldPhone: contact.phone || '',
          newPhone: '',
          status: `failed - ${errMessage}`
        });
      }
    }

    console.log(`[UpdateLID] Complete. Updated: ${results.updated}, Failed: ${results.failed}, Skipped: ${results.skipped}`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[UpdateLID] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
