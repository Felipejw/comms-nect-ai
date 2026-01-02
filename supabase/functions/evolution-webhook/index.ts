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
          })
          .eq("id", conn.id);

        console.log(`Connection ${conn.id} status updated to: ${status}`);
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
        
        // If no remoteJidAlt, try Evolution API lookup
        if (!realPhoneNumber && isLid && phoneNumber) {
          try {
            const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
            const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
            
            if (evolutionUrl && evolutionKey) {
              // Fetch ALL contacts to find the LID -> real phone mapping
              const contactResponse = await fetch(`${evolutionUrl}/chat/findContacts/${instance}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': evolutionKey,
                },
                body: JSON.stringify({ where: {} }), // Fetch all contacts
              });
              
              if (contactResponse.ok) {
                const allContacts = await contactResponse.json();
                const contactsArray = Array.isArray(allContacts) ? allContacts : [];
                
                // 1. Find the LID contact
                const lidRemoteJid = `${phoneNumber}@lid`;
                const lidContact = contactsArray.find((c: any) => c.remoteJid === lidRemoteJid);
                
                if (lidContact) {
                  console.log(`[Webhook] Found LID contact:`, JSON.stringify(lidContact));
                  
                  // 2. Try to find linked contact with same pushName and real number
                  const contactPushName = lidContact.pushName || pushName;
                  if (contactPushName) {
                    const linkedContact = contactsArray.find((c: any) => 
                      c.pushName === contactPushName && 
                      c.remoteJid?.includes('@s.whatsapp.net')
                    );
                    
                    if (linkedContact) {
                      realPhoneNumber = linkedContact.remoteJid.replace('@s.whatsapp.net', '');
                      console.log(`[Webhook] Found real phone via pushName match: ${realPhoneNumber}`);
                    }
                  }
                }
                
                // 3. If still no match, try direct ID lookup
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
            }
          } catch (lookupError) {
            console.error(`[Webhook] Error looking up contact:`, lookupError);
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
        // IMPORTANT: pushName from fromMe messages contains OUR name, not the contact's
        // Only use pushName for received messages (fromMe: false)
        let contactName = phoneNumber || "Contato Desconhecido";
        if (!fromMe && data?.pushName) {
          // Only trust pushName for incoming messages
          contactName = data.pushName;
        }
        
        // Tentar extrair foto do perfil do WhatsApp (pode estar em diferentes locais)
        const profilePictureUrl = data?.profilePictureUrl || null;

        console.log(`[Webhook] Message ${fromMe ? 'SENT' : 'RECEIVED'} - Phone: ${phoneNumber}, Content: ${messageContent.substring(0, 50)}`);

        // ============ CONTACT SYNCHRONIZATION LOGIC ============
        // Priority: 1. Find by real phone, 2. Find by LID, 3. Create new
        // Always merge LID with real phone when both are known
        let contact;
        
        // 1. First, try to find by REAL phone number (if we have one)
        if (realPhoneNumber && realPhoneNumber !== whatsappLid) {
          const { data: contactByPhone } = await supabaseClient
            .from("contacts")
            .select("*")
            .eq("phone", realPhoneNumber)
            .single();
          
          if (contactByPhone) {
            contact = contactByPhone;
            console.log(`[Webhook] Found contact by real phone: ${contact.id}`);
            
            // Add LID to this contact if not already set
            if (whatsappLid && !contact.whatsapp_lid) {
              await supabaseClient
                .from("contacts")
                .update({ whatsapp_lid: whatsappLid })
                .eq("id", contact.id);
              console.log(`[Webhook] Added LID ${whatsappLid} to existing contact ${contact.id}`);
            }
          }
        }
        
        // 2. If not found by real phone, try to find by LID
        if (!contact && whatsappLid) {
          const { data: contactByLid } = await supabaseClient
            .from("contacts")
            .select("*")
            .eq("whatsapp_lid", whatsappLid)
            .single();
          
          if (contactByLid) {
            contact = contactByLid;
            console.log(`[Webhook] Found contact by LID: ${contact.id}`);
            
            // Update phone to real number if we now have it and it was stored as LID
            if (realPhoneNumber && realPhoneNumber !== whatsappLid) {
              if (!contact.phone || contact.phone === whatsappLid || contact.phone.length > 15) {
                await supabaseClient
                  .from("contacts")
                  .update({ phone: realPhoneNumber })
                  .eq("id", contact.id);
                console.log(`[Webhook] Updated contact phone from LID to real: ${realPhoneNumber}`);
              }
            }
          }
        }
        
        // 3. Fallback: try by phoneNumber (which could be LID or real)
        if (!contact) {
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
            contact.name?.match(/^\d{15,}$/);
          
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
          // Create new contact - ONLY use real phone, never LID in phone field
          const phoneToStore = (realPhoneNumber && realPhoneNumber !== whatsappLid) 
            ? realPhoneNumber 
            : finalPhoneNumber;
          
          const { data: newContact, error: contactError } = await supabaseClient
            .from("contacts")
            .insert({
              name: contactName,
              phone: phoneToStore, // Real phone when available
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
          
          // Update last_message_at and ensure connection_id is set
          await supabaseClient
            .from("conversations")
            .update({ 
              last_message_at: new Date().toISOString(),
              unread_count: fromMe ? existingConversation.unread_count : (existingConversation.unread_count || 0) + 1,
              connection_id: conn.id, // Ensure connection is linked
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
        console.log("[Webhook] Message status update:", data);
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
