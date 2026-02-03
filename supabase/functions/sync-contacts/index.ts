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

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Baileys server URL from settings
    const { data: baileysUrlSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_server_url")
      .single();

    const { data: baileysApiKeySetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_key")
      .single();

    const baileysUrl = baileysUrlSetting?.value;
    const baileysApiKey = baileysApiKeySetting?.value;

    if (!baileysUrl) {
      return new Response(
        JSON.stringify({ error: "Baileys server URL not configured in system settings" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const sessionData = connection.session_data as Record<string, unknown> | null;
    const sessionName = (sessionData?.sessionName as string) || connection.name.toLowerCase().replace(/\s+/g, "_");
    console.log(`[SyncContacts] Using instance: ${sessionName}`);

    // Build headers for Baileys API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (baileysApiKey) {
      headers['X-API-Key'] = baileysApiKey;
    }

    // Fetch ALL WhatsApp contacts from Baileys API
    console.log(`[SyncContacts] Fetching contacts from Baileys API...`);
    const contactResponse = await fetch(`${baileysUrl}/sessions/${sessionName}/contacts`, {
      method: 'GET',
      headers,
    });

    if (!contactResponse.ok) {
      const errorText = await contactResponse.text();
      console.error(`[SyncContacts] Failed to fetch contacts:`, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch contacts from WhatsApp" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contactResult = await contactResponse.json();
    const whatsAppContactsArray = Array.isArray(contactResult.data) ? contactResult.data : 
                                   Array.isArray(contactResult) ? contactResult : [];
    console.log(`[SyncContacts] Got ${whatsAppContactsArray.length} contacts from WhatsApp`);

    // Build lookup maps for faster access
    // Map: LID -> WhatsApp contact info
    // deno-lint-ignore no-explicit-any
    const lidToContact = new Map<string, any>();
    // Map: Phone -> WhatsApp contact info
    // deno-lint-ignore no-explicit-any
    const phoneToContact = new Map<string, any>();
    // Map: LID -> Real phone (via pushName matching)
    const lidToRealPhone = new Map<string, string>();

    for (const waContact of whatsAppContactsArray) {
      const remoteJid = waContact.id || waContact.remoteJid || '';
      const pushName = waContact.name || waContact.pushName || waContact.notify || '';
      
      if (remoteJid.includes('@lid')) {
        const lid = remoteJid.replace('@lid', '').split(':')[0];
        lidToContact.set(lid, { ...waContact, pushName });
        
        // Try to find real phone via pushName
        if (pushName) {
          // deno-lint-ignore no-explicit-any
          const linkedContact = whatsAppContactsArray.find((c: any) => {
            const cName = c.name || c.pushName || c.notify || '';
            const cJid = c.id || c.remoteJid || '';
            return cName === pushName && cJid.includes('@s.whatsapp.net');
          });
          if (linkedContact) {
            const realPhone = (linkedContact.id || linkedContact.remoteJid || '').replace('@s.whatsapp.net', '');
            lidToRealPhone.set(lid, realPhone);
          }
        }
      } else if (remoteJid.includes('@s.whatsapp.net')) {
        const phone = remoteJid.replace('@s.whatsapp.net', '');
        phoneToContact.set(phone, { ...waContact, pushName });
      }
    }

    console.log(`[SyncContacts] Built maps: ${lidToContact.size} LIDs, ${phoneToContact.size} phones, ${lidToRealPhone.size} LID->phone mappings`);

    // Get all contacts from database that need updating
    // Criteria: bad names, phone looks like LID, or phone === whatsapp_lid
    const { data: dbContacts, error: dbError } = await supabase
      .from('contacts')
      .select('id, name, phone, whatsapp_lid');

    if (dbError) {
      console.error(`[SyncContacts] Error fetching DB contacts:`, dbError);
      throw dbError;
    }

    // Filter contacts that need checking
    const badNames = ['Chatbot Whats', 'Contato Desconhecido'];
    const uniqueContacts = (dbContacts || []).filter(c => {
      // Bad name
      const nameIsBad = badNames.includes(c.name) || 
                       c.name === c.phone || 
                       c.name?.match(/^\d{14,}$/);
      
      // Phone looks like LID (long number)
      const phoneLooksLikeLid = c.phone && c.phone.length > 13;
      
      // Phone equals whatsapp_lid (definitely a LID stored as phone)
      const phoneEqualsLid = c.phone && c.whatsapp_lid && c.phone === c.whatsapp_lid;
      
      return nameIsBad || phoneLooksLikeLid || phoneEqualsLid;
    });

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
        // deno-lint-ignore no-explicit-any
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
