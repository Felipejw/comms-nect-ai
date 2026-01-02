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

    // Get an active WhatsApp connection
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
    console.log(`[SyncContacts] Using instance: ${instanceName}`);

    // Fetch ALL WhatsApp contacts from Evolution API
    console.log(`[SyncContacts] Fetching contacts from Evolution API...`);
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
      console.error(`[SyncContacts] Failed to fetch contacts:`, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch contacts from WhatsApp" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allWhatsAppContacts = await contactResponse.json();
    const whatsAppContactsArray = Array.isArray(allWhatsAppContacts) ? allWhatsAppContacts : [];
    console.log(`[SyncContacts] Got ${whatsAppContactsArray.length} contacts from WhatsApp`);

    // Build lookup maps for faster access
    // Map: LID -> WhatsApp contact info
    const lidToContact = new Map<string, any>();
    // Map: Phone -> WhatsApp contact info
    const phoneToContact = new Map<string, any>();
    // Map: LID -> Real phone (via pushName matching)
    const lidToRealPhone = new Map<string, string>();

    for (const waContact of whatsAppContactsArray) {
      const remoteJid = waContact.remoteJid || '';
      
      if (remoteJid.includes('@lid')) {
        const lid = remoteJid.replace('@lid', '').split(':')[0];
        lidToContact.set(lid, waContact);
        
        // Try to find real phone via pushName
        if (waContact.pushName) {
          const linkedContact = whatsAppContactsArray.find((c: any) => 
            c.pushName === waContact.pushName && 
            c.remoteJid?.includes('@s.whatsapp.net')
          );
          if (linkedContact) {
            const realPhone = linkedContact.remoteJid.replace('@s.whatsapp.net', '');
            lidToRealPhone.set(lid, realPhone);
          }
        }
      } else if (remoteJid.includes('@s.whatsapp.net')) {
        const phone = remoteJid.replace('@s.whatsapp.net', '');
        phoneToContact.set(phone, waContact);
      }
    }

    console.log(`[SyncContacts] Built maps: ${lidToContact.size} LIDs, ${phoneToContact.size} phones, ${lidToRealPhone.size} LID->phone mappings`);

    // Get all contacts from database that need updating
    const { data: dbContacts, error: dbError } = await supabase
      .from('contacts')
      .select('id, name, phone, whatsapp_lid')
      .or('name.eq.Chatbot Whats,name.eq.Contato Desconhecido,phone.like.%000000000%');

    if (dbError) {
      console.error(`[SyncContacts] Error fetching DB contacts:`, dbError);
      throw dbError;
    }

    // Also get contacts where phone looks like a LID (length > 15)
    const { data: lidPhoneContacts } = await supabase
      .from('contacts')
      .select('id, name, phone, whatsapp_lid')
      .not('phone', 'is', null);

    const allDbContacts = [
      ...(dbContacts || []),
      ...(lidPhoneContacts?.filter(c => c.phone && c.phone.length > 15) || [])
    ];

    // Remove duplicates
    const uniqueContacts = Array.from(
      new Map(allDbContacts.map(c => [c.id, c])).values()
    );

    console.log(`[SyncContacts] Processing ${uniqueContacts.length} contacts from database`);

    const results = {
      total: uniqueContacts.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      details: [] as { id: string; name: string; updates: Record<string, string>; status: string }[]
    };

    for (const contact of uniqueContacts) {
      try {
        const updates: Record<string, string> = {};
        let waContact: any = null;

        // Try to find WhatsApp contact info
        // 1. By LID
        if (contact.whatsapp_lid) {
          waContact = lidToContact.get(contact.whatsapp_lid);
          
          // Check if we have a real phone mapping
          const realPhone = lidToRealPhone.get(contact.whatsapp_lid);
          if (realPhone && (!contact.phone || contact.phone === contact.whatsapp_lid || contact.phone.length > 15)) {
            updates.phone = realPhone;
          }
        }

        // 2. By phone number
        if (!waContact && contact.phone && contact.phone.length <= 15) {
          waContact = phoneToContact.get(contact.phone);
        }

        // Update name if we found a pushName and current name is bad
        const badNames = ['Chatbot Whats', 'Contato Desconhecido'];
        const nameIsBad = badNames.includes(contact.name) || 
                         contact.name === contact.phone || 
                         contact.name?.match(/^\d{15,}$/);

        if (waContact?.pushName && nameIsBad) {
          updates.name = waContact.pushName;
        }

        // Apply updates if any
        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('contacts')
            .update(updates)
            .eq('id', contact.id);

          if (updateError) {
            console.error(`[SyncContacts] Error updating ${contact.id}:`, updateError);
            results.failed++;
            results.details.push({
              id: contact.id,
              name: contact.name,
              updates,
              status: 'failed'
            });
          } else {
            console.log(`[SyncContacts] Updated ${contact.name} -> ${JSON.stringify(updates)}`);
            results.updated++;
            results.details.push({
              id: contact.id,
              name: contact.name,
              updates,
              status: 'updated'
            });
          }
        } else {
          results.skipped++;
          results.details.push({
            id: contact.id,
            name: contact.name,
            updates: {},
            status: 'skipped - no updates needed or no WhatsApp info found'
          });
        }
      } catch (err) {
        console.error(`[SyncContacts] Error processing ${contact.id}:`, err);
        results.failed++;
        results.details.push({
          id: contact.id,
          name: contact.name,
          updates: {},
          status: `error: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }

    console.log(`[SyncContacts] Complete. Updated: ${results.updated}, Skipped: ${results.skipped}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SyncContacts] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
