import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MergeResult {
  total: number;
  merged: number;
  updated: number;
  failed: number;
  details: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const result: MergeResult = {
      total: 0,
      merged: 0,
      updated: 0,
      failed: 0,
      details: [],
    };

    console.log("[MergeContacts] Starting duplicate contact cleanup...");

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

    const baileysUrl = baileysUrlSetting?.value || Deno.env.get("BAILEYS_API_URL") || "http://baileys:3000";
    const baileysApiKey = baileysApiKeySetting?.value || Deno.env.get("BAILEYS_API_KEY");

    // 1. Find contacts with LID stored as phone (phone > 15 digits or matches whatsapp_lid)
    const { data: problematicContacts, error: fetchError } = await supabase
      .from("contacts")
      .select("*")
      .or("phone.gt.15,phone.eq.whatsapp_lid")
      .order("created_at", { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch contacts: ${fetchError.message}`);
    }

    // Also get contacts where phone is NULL but has whatsapp_lid
    const { data: lidOnlyContacts } = await supabase
      .from("contacts")
      .select("*")
      .is("phone", null)
      .not("whatsapp_lid", "is", null);

    // Combine and filter for actual problematic contacts
    const allProblemContacts = [
      ...(problematicContacts || []),
      ...(lidOnlyContacts || []),
    ].filter(c => {
      // LID stored as phone
      if (c.phone && c.phone === c.whatsapp_lid) return true;
      // Phone looks like a LID (too long)
      if (c.phone && c.phone.replace(/\D/g, '').length > 15) return true;
      // Has LID but no phone
      if (!c.phone && c.whatsapp_lid) return true;
      return false;
    });

    // Remove duplicates by id
    const uniqueContacts = Array.from(
      new Map(allProblemContacts.map(c => [c.id, c])).values()
    );

    result.total = uniqueContacts.length;
    console.log(`[MergeContacts] Found ${result.total} contacts to process`);

    // Get default WhatsApp connection for Baileys API calls
    const { data: connection } = await supabase
      .from("connections")
      .select("*")
      .eq("type", "whatsapp")
      .eq("status", "connected")
      .limit(1)
      .single();

    // deno-lint-ignore no-explicit-any
    let allWhatsAppContacts: any[] = [];
    
    if (connection && baileysUrl) {
      const sessionData = connection.session_data as Record<string, unknown> | null;
      const sessionName = (sessionData?.sessionName as string) || connection.name.toLowerCase().replace(/\s+/g, "_");
      
      try {
        // Build headers for Baileys API
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (baileysApiKey) {
          headers['X-API-Key'] = baileysApiKey;
        }

        const contactResponse = await fetch(`${baileysUrl}/sessions/${sessionName}/contacts`, {
          method: 'GET',
          headers,
        });
        
        if (contactResponse.ok) {
          const contactResult = await contactResponse.json();
          allWhatsAppContacts = Array.isArray(contactResult.data) ? contactResult.data : 
                               Array.isArray(contactResult) ? contactResult : [];
          console.log(`[MergeContacts] Fetched ${allWhatsAppContacts.length} WhatsApp contacts from Baileys`);
        }
      } catch (e) {
        console.error("[MergeContacts] Failed to fetch WhatsApp contacts:", e);
      }
    }

    // Build lookup maps
    // deno-lint-ignore no-explicit-any
    const phoneLookup = new Map<string, any>();
    // deno-lint-ignore no-explicit-any
    const lidLookup = new Map<string, any>();
    
    for (const waContact of allWhatsAppContacts) {
      const remoteJid = waContact.id || waContact.remoteJid || '';
      if (remoteJid.includes('@s.whatsapp.net')) {
        const phone = remoteJid.replace('@s.whatsapp.net', '');
        phoneLookup.set(phone, waContact);
      }
      if (remoteJid.includes('@lid')) {
        const lid = remoteJid.replace('@lid', '').split(':')[0];
        lidLookup.set(lid, waContact);
      }
    }

    // Process each problematic contact
    for (const contact of uniqueContacts) {
      try {
        const lid = contact.whatsapp_lid || contact.phone;
        if (!lid) {
          result.details.push(`Skipped ${contact.id}: no LID or phone`);
          continue;
        }

        // Try to find real phone number
        let realPhone: string | null = null;
        let realName: string | null = null;

        // 1. Check if LID exists in WhatsApp contacts
        const lidContact = lidLookup.get(lid);
        if (lidContact) {
          const pushName = lidContact.name || lidContact.pushName || lidContact.notify || '';
          if (pushName) {
            realName = pushName;
            
            // Find matching contact by pushName with real phone
            for (const waContact of allWhatsAppContacts) {
              const waName = waContact.name || waContact.pushName || waContact.notify || '';
              const waJid = waContact.id || waContact.remoteJid || '';
              if (waName === pushName && waJid.includes('@s.whatsapp.net')) {
                realPhone = waJid.replace('@s.whatsapp.net', '');
                break;
              }
            }
          }
        }

        if (!realPhone && contact.name) {
          // Try finding by name
          for (const waContact of allWhatsAppContacts) {
            const waName = waContact.name || waContact.pushName || waContact.notify || '';
            const waJid = waContact.id || waContact.remoteJid || '';
            if (waName === contact.name && waJid.includes('@s.whatsapp.net')) {
              realPhone = waJid.replace('@s.whatsapp.net', '');
              break;
            }
          }
        }

        if (realPhone) {
          // Check if there's already a contact with this real phone
          const { data: existingContact } = await supabase
            .from("contacts")
            .select("*")
            .eq("phone", realPhone)
            .neq("id", contact.id)
            .single();

          if (existingContact) {
            // MERGE: Move everything to existing contact and delete duplicate
            console.log(`[MergeContacts] Merging ${contact.id} -> ${existingContact.id}`);

            // Move conversations
            const { data: conversations } = await supabase
              .from("conversations")
              .select("id")
              .eq("contact_id", contact.id);

            if (conversations && conversations.length > 0) {
              await supabase
                .from("conversations")
                .update({ contact_id: existingContact.id })
                .in("id", conversations.map(c => c.id));
            }

            // Move tags
            const { data: tags } = await supabase
              .from("contact_tags")
              .select("tag_id")
              .eq("contact_id", contact.id);

            if (tags && tags.length > 0) {
              const { data: existingTags } = await supabase
                .from("contact_tags")
                .select("tag_id")
                .eq("contact_id", existingContact.id);

              const existingTagIds = new Set((existingTags || []).map(t => t.tag_id));
              const newTags = tags.filter(t => !existingTagIds.has(t.tag_id));

              if (newTags.length > 0) {
                await supabase
                  .from("contact_tags")
                  .insert(newTags.map(t => ({
                    contact_id: existingContact.id,
                    tag_id: t.tag_id,
                  })));
              }

              await supabase
                .from("contact_tags")
                .delete()
                .eq("contact_id", contact.id);
            }

            // Update existing contact with LID if missing
            if (!existingContact.whatsapp_lid && lid) {
              await supabase
                .from("contacts")
                .update({ whatsapp_lid: lid })
                .eq("id", existingContact.id);
            }

            // Delete the duplicate
            await supabase
              .from("contacts")
              .delete()
              .eq("id", contact.id);

            result.merged++;
            result.details.push(`Merged: ${contact.name} (${contact.id}) -> ${existingContact.name} (${existingContact.id})`);
          } else {
            // UPDATE: Just update the phone and LID
            // deno-lint-ignore no-explicit-any
            const updates: Record<string, any> = {
              phone: realPhone,
            };

            if (!contact.whatsapp_lid) {
              updates.whatsapp_lid = lid;
            }

            if (realName && (contact.name === lid || contact.name === 'Chatbot Whats' || contact.name === 'Contato Desconhecido')) {
              updates.name = realName;
            }

            await supabase
              .from("contacts")
              .update(updates)
              .eq("id", contact.id);

            result.updated++;
            result.details.push(`Updated: ${contact.name} -> phone: ${realPhone}`);
          }
        } else {
          // Could not find real phone, just ensure LID is in correct field
          if (contact.phone && contact.phone === contact.whatsapp_lid) {
            // Phone is LID, set phone to null
            await supabase
              .from("contacts")
              .update({ phone: null })
              .eq("id", contact.id);
            
            result.updated++;
            result.details.push(`Fixed: ${contact.name} - removed LID from phone field`);
          } else if (contact.phone && contact.phone.length > 15 && !contact.whatsapp_lid) {
            // Phone looks like LID but whatsapp_lid not set
            await supabase
              .from("contacts")
              .update({ 
                whatsapp_lid: contact.phone,
                phone: null 
              })
              .eq("id", contact.id);
            
            result.updated++;
            result.details.push(`Fixed: ${contact.name} - moved LID from phone to whatsapp_lid`);
          } else {
            result.details.push(`Skipped: ${contact.name} - could not determine real phone`);
          }
        }
      } catch (error) {
        result.failed++;
        result.details.push(`Failed: ${contact.name} - ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error(`[MergeContacts] Error processing ${contact.id}:`, error);
      }
    }

    // 2. Update contacts with bad names
    const { data: badNameContacts } = await supabase
      .from("contacts")
      .select("*")
      .in("name", ["Chatbot Whats", "Contato Desconhecido"]);

    if (badNameContacts && badNameContacts.length > 0) {
      console.log(`[MergeContacts] Found ${badNameContacts.length} contacts with placeholder names`);

      for (const contact of badNameContacts) {
        const phone = contact.phone;
        const lid = contact.whatsapp_lid;

        let realName: string | null = null;

        if (phone && phone.length <= 15) {
          const waContact = phoneLookup.get(phone);
          const pushName = waContact?.name || waContact?.pushName || waContact?.notify || '';
          if (pushName) {
            realName = pushName;
          }
        }

        if (!realName && lid) {
          const lidContact = lidLookup.get(lid);
          const pushName = lidContact?.name || lidContact?.pushName || lidContact?.notify || '';
          if (pushName) {
            realName = pushName;
          }
        }

        if (realName && realName !== 'Chatbot Whats' && realName !== 'Contato Desconhecido') {
          await supabase
            .from("contacts")
            .update({ name: realName })
            .eq("id", contact.id);

          result.updated++;
          result.details.push(`Name fixed: ${contact.name} -> ${realName}`);
        }
      }
    }

    console.log(`[MergeContacts] Completed. Merged: ${result.merged}, Updated: ${result.updated}, Failed: ${result.failed}`);

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[MergeContacts] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
