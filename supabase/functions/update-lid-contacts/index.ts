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

    // Get all contacts with whatsapp_lid
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, name, phone, whatsapp_lid')
      .not('whatsapp_lid', 'is', null);

    if (contactsError) {
      console.error("[UpdateLID] Error fetching contacts:", contactsError);
      throw contactsError;
    }

    console.log(`[UpdateLID] Found ${contacts?.length || 0} contacts with LID`);

    // Get an active connection
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
    
    // Fetch all WhatsApp contacts at once to avoid multiple API calls
    console.log(`[UpdateLID] Fetching all contacts from Evolution API...`);
    const contactResponse = await fetch(`${evolutionUrl}/chat/findContacts/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey,
      },
      body: JSON.stringify({ where: {} }),
    });

    if (!contactResponse.ok) {
      const errorText = await contactResponse.text();
      console.error(`[UpdateLID] Failed to fetch contacts from Evolution:`, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch contacts from WhatsApp" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allWhatsAppContacts = await contactResponse.json();
    const whatsAppContactsArray = Array.isArray(allWhatsAppContacts) ? allWhatsAppContacts : [];
    console.log(`[UpdateLID] Got ${whatsAppContactsArray.length} contacts from WhatsApp`);

    const results = {
      total: contacts?.length || 0,
      updated: 0,
      merged: 0,
      failed: 0,
      skipped: 0,
      details: [] as { id: string; name: string; oldPhone: string; newPhone: string; status: string; mergedWith?: string }[]
    };

    for (const contact of contacts || []) {
      try {
        const lid = contact.whatsapp_lid;
        
        // Check if phone is already a valid number (different from LID and reasonable length)
        const hasValidPhone = contact.phone && 
                             contact.phone !== lid && 
                             contact.phone.length >= 10 && 
                             contact.phone.length <= 15;
        
        if (hasValidPhone) {
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

        // Find the LID contact in WhatsApp contacts
        const lidRemoteJid = `${lid}@lid`;
        const lidContact = whatsAppContactsArray.find((c: any) => c.remoteJid === lidRemoteJid);
        
        let realPhone: string | null = null;
        
        if (lidContact && lidContact.pushName) {
          // Find linked contact with same pushName and real number
          const linkedContact = whatsAppContactsArray.find((c: any) => 
            c.pushName === lidContact.pushName && 
            c.remoteJid?.includes('@s.whatsapp.net')
          );
          
          if (linkedContact) {
            realPhone = linkedContact.remoteJid.replace('@s.whatsapp.net', '');
            console.log(`[UpdateLID] Found real phone via pushName for ${contact.name}: ${realPhone}`);
          }
        }

        if (!realPhone) {
          console.log(`[UpdateLID] Could not find real phone for ${contact.name} (LID: ${lid})`);
          results.failed++;
          results.details.push({
            id: contact.id,
            name: contact.name,
            oldPhone: contact.phone || '',
            newPhone: '',
            status: 'failed - no real phone found'
          });
          continue;
        }

        // Check if there's already a contact with this real phone number
        const { data: existingContactWithPhone } = await supabase
          .from('contacts')
          .select('id, name')
          .eq('phone', realPhone)
          .neq('id', contact.id)
          .single();

        if (existingContactWithPhone) {
          // Merge: Move conversations from LID contact to real phone contact
          console.log(`[UpdateLID] Found duplicate! Merging ${contact.name} into ${existingContactWithPhone.name}`);
          
          // Update all conversations to point to the real contact
          const { error: convUpdateError } = await supabase
            .from('conversations')
            .update({ contact_id: existingContactWithPhone.id })
            .eq('contact_id', contact.id);
          
          if (convUpdateError) {
            console.error(`[UpdateLID] Error moving conversations:`, convUpdateError);
            results.failed++;
            results.details.push({
              id: contact.id,
              name: contact.name,
              oldPhone: contact.phone || '',
              newPhone: realPhone,
              status: 'failed - could not merge conversations'
            });
            continue;
          }

          // Update the real contact to have the LID if it doesn't
          const { data: realContact } = await supabase
            .from('contacts')
            .select('whatsapp_lid')
            .eq('id', existingContactWithPhone.id)
            .single();
          
          if (realContact && !realContact.whatsapp_lid) {
            await supabase
              .from('contacts')
              .update({ whatsapp_lid: lid })
              .eq('id', existingContactWithPhone.id);
          }

          // Delete the duplicate LID contact
          const { error: deleteError } = await supabase
            .from('contacts')
            .delete()
            .eq('id', contact.id);
          
          if (deleteError) {
            console.error(`[UpdateLID] Error deleting duplicate contact:`, deleteError);
          }

          console.log(`[UpdateLID] Merged ${contact.name} into ${existingContactWithPhone.name} and deleted duplicate`);
          results.merged++;
          results.details.push({
            id: contact.id,
            name: contact.name,
            oldPhone: contact.phone || lid,
            newPhone: realPhone,
            status: 'merged',
            mergedWith: existingContactWithPhone.id
          });
        } else {
          // No duplicate - just update the phone number
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
        }

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

    console.log(`[UpdateLID] Complete. Updated: ${results.updated}, Merged: ${results.merged}, Failed: ${results.failed}, Skipped: ${results.skipped}`);

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
