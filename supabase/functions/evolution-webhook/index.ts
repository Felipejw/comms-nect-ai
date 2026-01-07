import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to download and store media
async function downloadAndStoreMedia(
  supabaseUrl: string,
  supabaseKey: string,
  instanceName: string,
  messageKey: { remoteJid: string; fromMe: boolean; id: string },
  mediaType: 'audio' | 'image' | 'video' | 'document',
  fileName?: string
): Promise<string | null> {
  try {
    console.log(`[Webhook] Downloading media: ${mediaType} for message ${messageKey.id}`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/download-whatsapp-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        instanceName,
        messageKey,
        mediaType,
        fileName
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Webhook] Failed to download media: ${response.status}`, errorText);
      return null;
    }

    const result = await response.json();
    if (result.success && result.url) {
      console.log(`[Webhook] Media downloaded successfully: ${result.url}`);
      return result.url;
    }

    console.error('[Webhook] Media download returned no URL:', result);
    return null;
  } catch (error) {
    console.error('[Webhook] Error downloading media:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const webhook = await req.json();
    console.log("[Webhook] ====== EVENT RECEIVED ======");
    console.log("[Webhook] Event:", webhook.event);
    console.log("[Webhook] Instance:", webhook.instance);
    console.log("[Webhook] Full payload:", JSON.stringify(webhook, null, 2));

    const { event, instance, data } = webhook;

    // Skip if no instance name
    if (!instance) {
      console.log("[Webhook] No instance name in payload, ignoring");
      return new Response(JSON.stringify({ success: true, message: "No instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find connection by instance name
    const { data: connection } = await supabaseClient
      .from("connections")
      .select("*")
      .eq("session_data->>instanceName", instance)
      .single();

    // Also try matching by name if session_data doesn't match
    let conn = connection;
    if (!conn) {
      const { data: connByName } = await supabaseClient
        .from("connections")
        .select("*")
        .eq("name", instance)
        .single();
      conn = connByName;
    }

    if (!conn) {
      // Silently ignore events for orphaned instances (not in our DB)
      console.log(`[Webhook] Connection not found for instance: ${instance} (orphaned, ignoring)`);
      return new Response(JSON.stringify({ success: true, message: "Orphaned instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log(`[Webhook] Found connection: ${conn.id} (${conn.name})`);
    console.log(`[Webhook] Current status: ${conn.status}, has QR: ${!!conn.qr_code}`);
    

    // Normalize event name to lowercase for comparison
    const eventLower = event?.toLowerCase();
    
    switch (eventLower) {
      case "connection.update":
      case "connection_update": {
        // Connection status changed
        const state = data?.state;
        
        // Se for desconexão, verificar se foi solicitada explicitamente
        if (state === "close" || state === "disconnected") {
          // Verificar se a desconexão foi explicitamente solicitada pelo usuário
          if (!conn.disconnect_requested) {
            console.log(`[Webhook] Disconnect event received for ${conn.name} but not explicitly requested`);
            
            // Verificar status real na Evolution API antes de aceitar o evento
            try {
              const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
              const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
              
              if (evolutionUrl && evolutionKey) {
                const statusResponse = await fetch(
                  `${evolutionUrl}/instance/connectionState/${instance}`,
                  { headers: { "apikey": evolutionKey } }
                );
                
                if (statusResponse.ok) {
                  const statusData = await statusResponse.json();
                  const realState = statusData?.instance?.state;
                  
                  console.log(`[Webhook] Evolution API says real state is: ${realState}`);
                  
                  if (realState === "open") {
                    console.log(`[Webhook] Instance ${conn.name} is still connected, ignoring false disconnect event`);
                    break; // Ignora o evento falso de desconexão
                  }
                }
              }
            } catch (e) {
              console.error(`[Webhook] Error checking real status:`, e);
              // Em caso de erro, ignorar o evento de desconexão por segurança
              console.log(`[Webhook] Ignoring disconnect event due to verification error`);
              break;
            }
          }
          
          // Se chegou aqui, é uma desconexão real (solicitada ou confirmada pela API)
          console.log(`[Webhook] Processing disconnect for ${conn.name} (requested: ${conn.disconnect_requested})`);
          
          await supabaseClient
            .from("connections")
            .update({ 
              status: "disconnected",
              qr_code: null,
              disconnect_requested: false // Limpar flag
            })
            .eq("id", conn.id);
            
          console.log(`[Webhook] Connection ${conn.id} disconnected`);
          break;
        }
        
        // Para outros estados (open, connecting, qrcode)
        let status = "disconnected";

        if (state === "open") {
          status = "connected";
        } else if (state === "connecting" || state === "qrcode") {
          status = "connecting";
        }

        await supabaseClient
          .from("connections")
          .update({ 
            status,
            phone_number: data?.instance?.wuid?.split("@")[0] || conn.phone_number,
            qr_code: status === "connected" ? null : conn.qr_code,
            disconnect_requested: false // Sempre limpar a flag
          })
          .eq("id", conn.id);

        console.log(`[Webhook] Connection ${conn.id} status updated to: ${status}`);
        break;
      }

      case "qrcode.updated":
      case "qrcode_updated": {
        // QR Code updated - extract base64 from various possible locations
        console.log("[Webhook] Processing QRCODE event...");
        console.log("[Webhook] Data keys:", Object.keys(data || {}));
        console.log("[Webhook] data.qrcode:", data?.qrcode);
        console.log("[Webhook] data.base64:", data?.base64?.substring?.(0, 50));
        
        let qrBase64 = data?.qrcode?.base64 || data?.base64 || data?.qrcode;
        
        // If qrcode is an object, try to extract base64
        if (qrBase64 && typeof qrBase64 === 'object' && qrBase64.base64) {
          qrBase64 = qrBase64.base64;
        }
        
        // Ensure proper data URI prefix
        if (qrBase64 && typeof qrBase64 === 'string' && !qrBase64.startsWith("data:")) {
          qrBase64 = `data:image/png;base64,${qrBase64}`;
        }
        
        if (qrBase64 && typeof qrBase64 === 'string') {
          await supabaseClient
            .from("connections")
            .update({ 
              qr_code: qrBase64,
              status: "connecting",
            })
            .eq("id", conn.id);

          console.log(`[Webhook] QR Code updated for connection ${conn.id}, length: ${qrBase64.length}`);
        } else {
          console.log(`[Webhook] QR Code event received but no valid base64 found. Data type: ${typeof qrBase64}`);
        }
        break;
      }

      case "messages.upsert": {
        // New message received or sent
        const remoteJid = data?.key?.remoteJid;
        const remoteJidAlt = data?.key?.remoteJidAlt; // Real phone when using LID
        const fromMe = data?.key?.fromMe || false;
        
        // Ignore group messages and broadcasts - only process direct messages
        if (remoteJid?.includes('@g.us') || remoteJid?.includes('@broadcast')) {
          console.log(`[Webhook] Ignoring group/broadcast message: ${remoteJid}`);
          break;
        }

        // Detect if this is a LID (Link ID) instead of a real phone number
        const isLid = remoteJid?.includes('@lid');
        
        // Extract phone number from remoteJid
        // Handle formats: 5511999999999@s.whatsapp.net, 64081549635686@lid, 64081549635686:25@lid
        let phoneNumber = remoteJid
          ?.replace('@s.whatsapp.net', '')
          ?.replace('@lid', '')
          ?.split(':')[0];

        // Store the original LID for reference and for sending messages
        const whatsappLid = isLid ? phoneNumber : null;
        
        // For LID contacts, try to get the real phone number
        // Priority: 1. remoteJidAlt (most reliable), 2. Evolution API lookup
        let realPhoneNumber: string | null = null;
        const pushName = data?.pushName;
        
        // First, try to get real phone from remoteJidAlt (sent by WhatsApp when using LID)
        if (isLid && remoteJidAlt?.includes('@s.whatsapp.net')) {
          realPhoneNumber = remoteJidAlt.replace('@s.whatsapp.net', '');
          console.log(`[Webhook] Got real phone from remoteJidAlt: ${realPhoneNumber}`);
        }
        
        // If no remoteJidAlt, try Evolution API lookup methods
        if (!realPhoneNumber && isLid && phoneNumber) {
          const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
          const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
          
          if (evolutionUrl && evolutionKey) {
            // Method 1: Try to fetch profile for the LID contact
            try {
              console.log(`[Webhook] Trying fetchProfile for LID ${phoneNumber}...`);
              const profileResponse = await fetch(
                `${evolutionUrl}/chat/fetchProfile/${instance}`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': evolutionKey,
                  },
                  body: JSON.stringify({ number: `${phoneNumber}@lid` }),
                }
              );
              
              if (profileResponse.ok) {
                const profile = await profileResponse.json();
                console.log(`[Webhook] Profile response:`, JSON.stringify(profile));
                
                // Check various fields where real phone might be
                const profilePhone = profile?.wuid?.replace('@s.whatsapp.net', '') ||
                                    profile?.jid?.replace('@s.whatsapp.net', '') ||
                                    profile?.number;
                
                if (profilePhone && profilePhone.length >= 10 && profilePhone.length <= 15 && !profilePhone.includes('@lid')) {
                  realPhoneNumber = profilePhone;
                  console.log(`[Webhook] Found real phone via profile: ${realPhoneNumber}`);
                }
              }
            } catch (profileError) {
              console.log(`[Webhook] Profile fetch failed:`, profileError);
            }
            
            // Method 2: Fetch ALL contacts to find the LID -> real phone mapping
            if (!realPhoneNumber) {
              try {
                const contactResponse = await fetch(`${evolutionUrl}/chat/findContacts/${instance}`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': evolutionKey,
                  },
                  body: JSON.stringify({ where: {} }),
                });
                
                if (contactResponse.ok) {
                  const allContacts = await contactResponse.json();
                  const contactsArray = Array.isArray(allContacts) ? allContacts : [];
                  
                  // Find the LID contact
                  const lidRemoteJid = `${phoneNumber}@lid`;
                  const lidContact = contactsArray.find((c: any) => c.remoteJid === lidRemoteJid);
                  
                  if (lidContact) {
                    console.log(`[Webhook] Found LID contact:`, JSON.stringify(lidContact));
                    
                    // Check if lidContact has remoteJidAlt with real phone
                    if (lidContact.remoteJidAlt?.includes('@s.whatsapp.net')) {
                      realPhoneNumber = lidContact.remoteJidAlt.replace('@s.whatsapp.net', '');
                      console.log(`[Webhook] Found real phone via remoteJidAlt in contact: ${realPhoneNumber}`);
                    }
                  }
                  
                  // Try direct ID lookup as fallback
                  if (!realPhoneNumber) {
                    const directMatch = contactsArray.find((c: any) => 
                      c.id === remoteJid && c.remoteJid?.includes('@s.whatsapp.net')
                    );
                    if (directMatch) {
                      realPhoneNumber = directMatch.remoteJid.replace('@s.whatsapp.net', '');
                      console.log(`[Webhook] Found real phone via direct match: ${realPhoneNumber}`);
                    }
                  }
                }
              } catch (lookupError) {
                console.error(`[Webhook] Error looking up contact:`, lookupError);
              }
            }
          }
        } else if (!isLid) {
          // Not a LID, use the phone number directly
          realPhoneNumber = phoneNumber;
        }

        // Final phone number to use (prefer real phone, fallback to LID if no real found)
        const finalPhoneNumber = realPhoneNumber || phoneNumber;

        if (!finalPhoneNumber) {
          console.log("[Webhook] Could not extract phone number from remoteJid:", remoteJid);
          break;
        }

        console.log(`[Webhook] Processing message - RealPhone: ${realPhoneNumber}, LID: ${whatsappLid}, isLID: ${isLid}, RemoteJid: ${remoteJid}`);

        // Get message content - handle different message types
        const message = data?.message || {};
        let messageContent = 
          message.conversation ||
          message.extendedTextMessage?.text ||
          message.imageMessage?.caption ||
          message.videoMessage?.caption ||
          message.documentMessage?.caption ||
          message.audioMessage?.caption ||
          null;
        
        // Determine message type and prepare for media download
        let messageType: "text" | "image" | "audio" | "document" | "video" = "text";
        let mediaUrl: string | null = null;
        let needsMediaDownload = false;
        let mediaFileName: string | undefined;
        
        if (message.imageMessage) {
          messageType = "image";
          needsMediaDownload = true;
          messageContent = messageContent || "[Imagem]";
        } else if (message.audioMessage) {
          messageType = "audio";
          needsMediaDownload = true;
          messageContent = messageContent || "[Áudio]";
        } else if (message.documentMessage) {
          messageType = "document";
          needsMediaDownload = true;
          mediaFileName = message.documentMessage.fileName;
          messageContent = messageContent || `[Documento: ${message.documentMessage.fileName || 'arquivo'}]`;
        } else if (message.videoMessage) {
          messageType = "video";
          needsMediaDownload = true;
          messageContent = messageContent || "[Vídeo]";
        } else if (message.stickerMessage) {
          messageType = "image";
          needsMediaDownload = true;
          messageContent = messageContent || "[Sticker]";
        }

        // Download media if needed (only for received messages, not sent by us)
        if (needsMediaDownload && !fromMe) {
          const messageKey = {
            remoteJid: data?.key?.remoteJid,
            fromMe: data?.key?.fromMe,
            id: data?.key?.id
          };
          
          mediaUrl = await downloadAndStoreMedia(
            supabaseUrl,
            supabaseServiceKey,
            instance,
            messageKey,
            messageType === 'video' ? 'video' : messageType as 'audio' | 'image' | 'document',
            mediaFileName
          );
        }

        // If no content at all, use fallback
        if (!messageContent) {
          messageContent = "[Mídia]";
        }

        // Get contact name with fallback
        // IMPORTANT: pushName from fromMe messages contains OUR name (the connected account), 
        // not the contact's name. Only use pushName for INCOMING messages (fromMe: false).
        // For new contacts, prefer formatted phone number over "Contato Desconhecido"
        let contactName: string;
        
        if (!fromMe && data?.pushName) {
          // Only trust pushName for incoming messages - this is the contact's actual name
          contactName = data.pushName;
        } else if (realPhoneNumber && realPhoneNumber.length <= 15) {
          // Use formatted phone number as name
          const phone = realPhoneNumber;
          // Format: 55 47 9642-0547
          if (phone.length >= 10) {
            const countryCode = phone.slice(0, 2);
            const areaCode = phone.slice(2, 4);
            const rest = phone.slice(4);
            const lastPart = rest.slice(-4);
            const firstPart = rest.slice(0, -4);
            contactName = `${countryCode} ${areaCode} ${firstPart}-${lastPart}`;
          } else {
            contactName = phone;
          }
        } else if (phoneNumber && phoneNumber.length <= 15) {
          // Fallback to phoneNumber if no realPhoneNumber
          contactName = phoneNumber;
        } else if (whatsappLid) {
          // Last resort: use last 8 digits of LID
          contactName = `LID ${whatsappLid.slice(-8)}`;
        } else {
          contactName = "Contato Desconhecido";
        }
        
        // Tentar extrair foto do perfil do WhatsApp (pode estar em diferentes locais)
        const profilePictureUrl = data?.profilePictureUrl || null;

        console.log(`[Webhook] Message ${fromMe ? 'SENT' : 'RECEIVED'} - Phone: ${phoneNumber}, Content: ${messageContent.substring(0, 50)}`);

        // ============ CONTACT SYNCHRONIZATION LOGIC WITH DUPLICATE MERGE ============
        // Priority: 1. Find by real phone, 2. Find by LID, 3. Create new
        // Always merge duplicates when both LID contact and real phone contact exist
        let contact;
        let contactByPhone = null;
        let contactByLid = null;
        
        // 1. First, try to find by REAL phone number (if we have one)
        if (realPhoneNumber && realPhoneNumber !== whatsappLid) {
          const { data: foundByPhone } = await supabaseClient
            .from("contacts")
            .select("*")
            .eq("phone", realPhoneNumber)
            .single();
          
          contactByPhone = foundByPhone;
          if (contactByPhone) {
            console.log(`[Webhook] Found contact by real phone: ${contactByPhone.id}`);
          }
        }
        
        // 2. Also check if there's a contact with LID
        if (whatsappLid) {
          // Check by whatsapp_lid field
          const { data: foundByLid } = await supabaseClient
            .from("contacts")
            .select("*")
            .eq("whatsapp_lid", whatsappLid)
            .single();
          
          if (foundByLid) {
            contactByLid = foundByLid;
            console.log(`[Webhook] Found contact by LID field: ${contactByLid.id}`);
          } else {
            // Also check if LID was stored as phone (the bug we're fixing)
            const { data: foundByPhoneAsLid } = await supabaseClient
              .from("contacts")
              .select("*")
              .eq("phone", whatsappLid)
              .single();
            
            if (foundByPhoneAsLid) {
              contactByLid = foundByPhoneAsLid;
              console.log(`[Webhook] Found contact with LID stored as phone: ${contactByLid.id}`);
            }
          }
        }
        
        // 3. MERGE LOGIC: If we found both phone and LID contacts and they're different
        if (contactByPhone && contactByLid && contactByPhone.id !== contactByLid.id) {
          console.log(`[Webhook] MERGING: LID contact ${contactByLid.id} -> Phone contact ${contactByPhone.id}`);
          
          // Move all conversations from LID contact to real phone contact
          const { data: lidConversations } = await supabaseClient
            .from("conversations")
            .select("id")
            .eq("contact_id", contactByLid.id);
          
          if (lidConversations && lidConversations.length > 0) {
            const conversationIds = lidConversations.map(c => c.id);
            
            // Update conversations to point to real contact
            await supabaseClient
              .from("conversations")
              .update({ contact_id: contactByPhone.id })
              .in("id", conversationIds);
            
            console.log(`[Webhook] Moved ${conversationIds.length} conversations to real contact`);
          }
          
          // Move all tags from LID contact to real phone contact
          const { data: lidTags } = await supabaseClient
            .from("contact_tags")
            .select("tag_id")
            .eq("contact_id", contactByLid.id);
          
          if (lidTags && lidTags.length > 0) {
            // Get existing tags on real contact to avoid duplicates
            const { data: existingTags } = await supabaseClient
              .from("contact_tags")
              .select("tag_id")
              .eq("contact_id", contactByPhone.id);
            
            const existingTagIds = new Set((existingTags || []).map(t => t.tag_id));
            const newTags = lidTags.filter(t => !existingTagIds.has(t.tag_id));
            
            if (newTags.length > 0) {
              await supabaseClient
                .from("contact_tags")
                .insert(newTags.map(t => ({
                  contact_id: contactByPhone.id,
                  tag_id: t.tag_id,
                })));
              console.log(`[Webhook] Moved ${newTags.length} tags to real contact`);
            }
            
            // Delete old tags
            await supabaseClient
              .from("contact_tags")
              .delete()
              .eq("contact_id", contactByLid.id);
          }
          
          // Delete the LID duplicate contact
          await supabaseClient
            .from("contacts")
            .delete()
            .eq("id", contactByLid.id);
          
          console.log(`[Webhook] Deleted duplicate LID contact: ${contactByLid.id}`);
          
          // Use the real phone contact
          contact = contactByPhone;
          
          // Update with LID if not set
          if (!contact.whatsapp_lid && whatsappLid) {
            await supabaseClient
              .from("contacts")
              .update({ whatsapp_lid: whatsappLid })
              .eq("id", contact.id);
            console.log(`[Webhook] Added LID ${whatsappLid} to merged contact`);
          }
        } else if (contactByPhone) {
          // Only found by phone - use it and add LID if needed
          contact = contactByPhone;
          if (whatsappLid && !contact.whatsapp_lid) {
            await supabaseClient
              .from("contacts")
              .update({ whatsapp_lid: whatsappLid })
              .eq("id", contact.id);
            console.log(`[Webhook] Added LID ${whatsappLid} to existing contact ${contact.id}`);
          }
        } else if (contactByLid) {
          // Only found by LID - use it and update phone if needed
          contact = contactByLid;
          
          // Update phone to real number if we now have it and it was stored as LID
          if (realPhoneNumber && realPhoneNumber !== whatsappLid) {
            if (!contact.phone || contact.phone === whatsappLid || contact.phone.length > 15) {
              await supabaseClient
                .from("contacts")
                .update({ 
                  phone: realPhoneNumber,
                  whatsapp_lid: contact.whatsapp_lid || whatsappLid 
                })
                .eq("id", contact.id);
              console.log(`[Webhook] Updated contact phone from LID to real: ${realPhoneNumber}`);
            }
          }
        } else {
          // 4. Fallback: try by phoneNumber (which could be LID or real)
          const { data: existingContact } = await supabaseClient
            .from("contacts")
            .select("*")
            .eq("phone", finalPhoneNumber)
            .single();
          
          contact = existingContact;
        }

        if (contact) {
          // Prepare updates for existing contact
          const updates: Record<string, string | null> = {};
          
          // Check if current name is a placeholder that needs updating
          const badNames = ['Chatbot Whats', 'Contato Desconhecido'];
          const currentNameIsPlaceholder = 
            badNames.includes(contact.name) ||
            contact.name === contact.phone || 
            contact.name === contact.whatsapp_lid ||
            contact.name?.match(/^\d{14,}$/); // LID pattern
          
          // Update name if:
          // 1. This is an INCOMING message (fromMe: false) - so pushName is the client's name
          // 2. We have a valid pushName
          // 3. Current name is just phone/LID or a placeholder
          if (!fromMe && data?.pushName && currentNameIsPlaceholder) {
            updates.name = data.pushName;
          }
          
          // If no pushName but contact has bad name, try to fetch from Evolution API
          if (currentNameIsPlaceholder && !updates.name && (whatsappLid || contact.phone)) {
            try {
              const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
              const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
              
              if (evolutionUrl && evolutionKey) {
                console.log(`[Webhook] Fetching contact name for ${contact.name} from Evolution API...`);
                
                const contactResponse = await fetch(`${evolutionUrl}/chat/findContacts/${instance}`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': evolutionKey,
                  },
                  body: JSON.stringify({ where: {} }),
                });
                
                if (contactResponse.ok) {
                  const allContacts = await contactResponse.json();
                  const contactsArray = Array.isArray(allContacts) ? allContacts : [];
                  
                  // Try to find contact by LID or phone
                  let waContact = null;
                  
                  if (whatsappLid) {
                    const lidRemoteJid = `${whatsappLid}@lid`;
                    waContact = contactsArray.find((c: any) => c.remoteJid === lidRemoteJid);
                  }
                  
                  if (!waContact && contact.phone && contact.phone.length <= 15) {
                    const phoneRemoteJid = `${contact.phone}@s.whatsapp.net`;
                    waContact = contactsArray.find((c: any) => c.remoteJid === phoneRemoteJid);
                  }
                  
                  if (waContact?.pushName && !badNames.includes(waContact.pushName)) {
                    updates.name = waContact.pushName;
                    console.log(`[Webhook] Found real name from Evolution: ${waContact.pushName}`);
                  }
                }
              }
            } catch (syncError) {
              console.error(`[Webhook] Error syncing contact name:`, syncError);
            }
          }
          
          // Update avatar if available and contact doesn't have one
          if (profilePictureUrl && !contact.avatar_url) {
            updates.avatar_url = profilePictureUrl;
          }
          
          // Store LID if we have it and contact doesn't
          if (whatsappLid && !contact.whatsapp_lid) {
            updates.whatsapp_lid = whatsappLid;
          }
          
          // Update phone to real number if it's still the LID
          if (realPhoneNumber && realPhoneNumber !== whatsappLid && 
              (contact.phone === whatsappLid || !contact.phone || contact.phone.length > 15)) {
            updates.phone = realPhoneNumber;
          }
          
          // Apply updates if any
          if (Object.keys(updates).length > 0) {
            await supabaseClient
              .from("contacts")
              .update(updates)
              .eq("id", contact.id);
            console.log(`[Webhook] Updated contact: ${JSON.stringify(updates)}`);
          }
        } else {
          // Create new contact - NEVER use LID in phone field
          // If we don't have real phone, leave phone null and store LID in whatsapp_lid
          const phoneToStore = (realPhoneNumber && realPhoneNumber !== whatsappLid) 
            ? realPhoneNumber 
            : null; // Never store LID as phone
          
          const { data: newContact, error: contactError } = await supabaseClient
            .from("contacts")
            .insert({
              name: contactName,
              phone: phoneToStore, // Real phone or null
              avatar_url: profilePictureUrl,
              whatsapp_lid: whatsappLid, // Always store LID for reference
              status: "active",
            })
            .select()
            .single();

          if (contactError) {
            console.error("[Webhook] Error creating contact:", contactError);
            throw contactError;
          }
          contact = newContact;
          console.log(`[Webhook] New contact created: ${contact.id} (${contactName}), Phone: ${phoneToStore}, LID: ${whatsappLid}`);
        }

        // Find or create conversation
        let conversation;
        const { data: existingConversation } = await supabaseClient
          .from("conversations")
          .select("*")
          .eq("contact_id", contact.id)
          .in("status", ["new", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (existingConversation) {
          conversation = existingConversation;
          
          // Format subject based on message type
          let subjectPreview = messageContent;
          if (messageType === 'audio') subjectPreview = '🎵 Áudio';
          else if (messageType === 'image') subjectPreview = '📷 Imagem';
          else if (messageType === 'video') subjectPreview = '🎬 Vídeo';
          else if (messageType === 'document') subjectPreview = '📎 Documento';
          else subjectPreview = messageContent.substring(0, 100);
          
          // Update last_message_at, subject with last message, and ensure connection_id is set
          await supabaseClient
            .from("conversations")
            .update({ 
              last_message_at: new Date().toISOString(),
              unread_count: fromMe ? existingConversation.unread_count : (existingConversation.unread_count || 0) + 1,
              connection_id: conn.id,
              subject: subjectPreview,
            })
            .eq("id", existingConversation.id);
        } else {
          const { data: newConversation, error: convError } = await supabaseClient
            .from("conversations")
            .insert({
              contact_id: contact.id,
              channel: "whatsapp",
              status: "new",
              subject: messageContent.substring(0, 50),
              unread_count: fromMe ? 0 : 1,
              is_bot_active: true,
              connection_id: conn.id, // Link conversation to the WhatsApp connection
            })
            .select()
            .single();

          if (convError) {
            console.error("[Webhook] Error creating conversation:", convError);
            throw convError;
          }
          conversation = newConversation;
          console.log(`[Webhook] New conversation created: ${conversation.id}`);
        }

        // Create message
        // sender_type: 'contact' for received, 'agent' for sent by us
        const { error: msgError } = await supabaseClient
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            content: messageContent,
            sender_type: fromMe ? "agent" : "contact",
            message_type: messageType,
            media_url: mediaUrl,
          });

        if (msgError) {
          console.error("[Webhook] Error creating message:", msgError);
          throw msgError;
        }

        console.log(`[Webhook] Message saved for conversation ${conversation.id} (type: ${messageType}, mediaUrl: ${mediaUrl}, fromMe: ${fromMe})`);

        // Trigger flow executor for incoming messages (not from us)
        if (!fromMe) {
          try {
            console.log("[Webhook] Triggering flow executor for conversation:", conversation.id);
            const flowResponse = await fetch(`${supabaseUrl}/functions/v1/execute-flow`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                conversationId: conversation.id,
                messageContent: messageContent,
                contactPhone: phoneNumber,
                connectionId: conn.id,
              }),
            });

            if (!flowResponse.ok) {
              console.error("[Webhook] Flow executor error:", await flowResponse.text());
            } else {
              const flowResult = await flowResponse.json();
              console.log("[Webhook] Flow executor result:", flowResult);
            }
          } catch (flowError) {
            console.error("[Webhook] Error calling flow executor:", flowError);
          }
        }
        break;
      }

      case "messages.update": {
        // Message status update (delivered, read, etc.)
        console.log("[Webhook] Processing message status update:", data);
        
        const updates = Array.isArray(data) ? data : [data];
        
        for (const update of updates) {
          const messageId = update?.key?.id;
          const remoteJid = update?.key?.remoteJid;
          const fromMe = update?.key?.fromMe;
          const status = update?.update?.status;
          
          // Only process messages sent by us (campaigns/system)
          if (!fromMe || !messageId) {
            console.log(`[Webhook] Skipping status update - fromMe: ${fromMe}, messageId: ${messageId}`);
            continue;
          }
          
          // Status codes: 2=sent, 3=delivered, 4=read, 5=played (audio)
          if (status !== 3 && status !== 4 && status !== 5) {
            console.log(`[Webhook] Skipping status ${status} - only processing 3 (delivered), 4 (read), 5 (played)`);
            continue;
          }
          
          // Extract phone from remoteJid
          const phone = remoteJid
            ?.replace("@s.whatsapp.net", "")
            ?.replace("@lid", "")
            ?.split(":")[0];
          
          if (!phone) {
            console.log(`[Webhook] Could not extract phone from remoteJid: ${remoteJid}`);
            continue;
          }
          
          console.log(`[Webhook] Looking for contact with phone/lid: ${phone}, status: ${status}`);
          
          // Find contact by phone or LID
          const { data: contacts } = await supabaseClient
            .from("contacts")
            .select("id")
            .or(`phone.eq.${phone},whatsapp_lid.eq.${phone}`);
          
          if (!contacts || contacts.length === 0) {
            console.log(`[Webhook] No contact found for phone: ${phone}`);
            continue;
          }
          
          const contactId = contacts[0].id;
          
          // Find campaign_contact with status "sent" (most recent)
          const { data: campaignContacts } = await supabaseClient
            .from("campaign_contacts")
            .select("id, campaign_id, delivered_at")
            .eq("contact_id", contactId)
            .eq("status", "sent")
            .order("sent_at", { ascending: false })
            .limit(1);
          
          if (!campaignContacts || campaignContacts.length === 0) {
            console.log(`[Webhook] No pending campaign_contact found for contact: ${contactId}`);
            continue;
          }
          
          const campaignContact = campaignContacts[0];
          console.log(`[Webhook] Found campaign_contact: ${campaignContact.id}, updating status ${status}`);
          
          if (status === 3) {
            // DELIVERED
            await supabaseClient
              .from("campaign_contacts")
              .update({ 
                status: "delivered",
                delivered_at: new Date().toISOString() 
              })
              .eq("id", campaignContact.id);
            
            // Increment delivered_count
            await supabaseClient.rpc("increment_campaign_delivered", { 
              campaign_id: campaignContact.campaign_id 
            });
            
            console.log(`[Webhook] Campaign contact ${campaignContact.id} marked as DELIVERED`);
            
          } else if (status === 4 || status === 5) {
            // READ or PLAYED
            const wasDelivered = !!campaignContact.delivered_at;
            
            await supabaseClient
              .from("campaign_contacts")
              .update({ 
                status: "read",
                read_at: new Date().toISOString(),
                delivered_at: campaignContact.delivered_at || new Date().toISOString()
              })
              .eq("id", campaignContact.id);
            
            // Increment read_count (and delivered if wasn't already)
            await supabaseClient.rpc("increment_campaign_read", { 
              campaign_id: campaignContact.campaign_id,
              was_delivered: wasDelivered
            });
            
            console.log(`[Webhook] Campaign contact ${campaignContact.id} marked as READ (wasDelivered: ${wasDelivered})`);
          }
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[Webhook] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
