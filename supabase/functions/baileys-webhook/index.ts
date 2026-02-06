import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map Baileys status to our system status
function mapBaileysStatus(status: string): string {
  const statusMap: Record<string, string> = {
    STOPPED: "disconnected",
    STARTING: "connecting",
    connecting: "connecting",
    connected: "connected",
    WORKING: "connected",
    FAILED: "disconnected",
    disconnected: "disconnected",
  };
  return statusMap[status] || "disconnected";
}

// Detect if a "from" address is a WhatsApp LID
// Now also checks rawJid from the payload for more reliable detection
function parseFromAddress(rawFrom: string, rawJid?: string): { identifier: string; isLid: boolean } {
  // If rawJid is provided, use it for more reliable LID detection
  const jidToCheck = rawJid || rawFrom;
  const isLid = jidToCheck.endsWith("@lid");
  const identifier = rawFrom
    .replace("@s.whatsapp.net", "")
    .replace("@g.us", "")
    .replace("@lid", "");
  return { identifier, isLid };
}

// Store media from base64
async function storeMediaFromBase64(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  sessionName: string,
  messageId: string,
  base64Data: string
): Promise<string | null> {
  try {
    // Regex that handles mimetypes with parameters like "audio/ogg; codecs=opus"
    const matches = base64Data.match(/^data:([\w\/\-\+\.]+(?:;\s*[\w\-]+=[\w\-]+)*);base64,(.+)$/);
    if (!matches) return null;

    const fullMimetype = matches[1];
    // Extract only the base mimetype (before parameters) for storage
    const mimetype = fullMimetype.split(';')[0].trim();
    const base64 = matches[2];
    const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "audio/ogg": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "application/pdf": "pdf",
    };
    const ext = extMap[mimetype] || mimetype.split("/")[1] || "bin";

    const storagePath = `${sessionName}/${messageId}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("whatsapp-media")
      .upload(storagePath, buffer, {
        contentType: mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Baileys Webhook] Error uploading media:", uploadError);
      return null;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from("whatsapp-media")
      .getPublicUrl(storagePath);

    console.log("[Baileys Webhook] Media stored:", publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error("[Baileys Webhook] Error processing media:", error);
    return null;
  }
}

// Resolve LID to real phone number in background via Baileys API
async function resolveLidInBackground(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  contactId: string,
  lidIdentifier: string,
  // deno-lint-ignore no-explicit-any
  connection: any
): Promise<void> {
  try {
    console.log(`[LID Resolution] Starting background resolution for contact ${contactId}, LID: ${lidIdentifier}`);

    // Get Baileys server URL from settings
    const { data: settings } = await supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_server_url")
      .single();

    const { data: apiKeySettings } = await supabaseClient
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_key")
      .single();

    const baileysUrl = settings?.value;
    const baileysApiKey = apiKeySettings?.value;

    if (!baileysUrl) {
      console.log("[LID Resolution] Baileys server URL not configured, skipping");
      return;
    }

    const sessionData = connection.session_data;
    const sessionName = sessionData?.sessionName || connection.name.toLowerCase().replace(/\s+/g, "_");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (baileysApiKey) {
      headers["X-API-Key"] = baileysApiKey;
    }

    // Try to resolve LID via Baileys contacts endpoint
    const contactsResponse = await fetch(
      `${baileysUrl}/sessions/${sessionName}/contacts/${lidIdentifier}@lid`,
      { method: "GET", headers }
    );

    if (contactsResponse.ok) {
      const contactData = await contactsResponse.json();
      console.log(`[LID Resolution] Baileys response:`, JSON.stringify(contactData).substring(0, 300));

      // Extract the real phone number if available
      const realPhone = contactData?.phone || contactData?.jid?.replace("@s.whatsapp.net", "") || null;

      if (realPhone && !realPhone.includes("@lid")) {
        const cleanPhone = realPhone.replace(/\D/g, "");
        if (cleanPhone.length >= 10 && cleanPhone.length <= 15) {
          console.log(`[LID Resolution] ✅ Resolved LID ${lidIdentifier} to phone: ${cleanPhone}`);
          await supabaseClient
            .from("contacts")
            .update({ phone: cleanPhone, updated_at: new Date().toISOString() })
            .eq("id", contactId);
          return;
        }
      }
    } else {
      const errorText = await contactsResponse.text().catch(() => "");
      console.log(`[LID Resolution] Baileys contacts endpoint returned ${contactsResponse.status}: ${errorText.substring(0, 200)}`);
    }

    console.log(`[LID Resolution] Could not resolve LID ${lidIdentifier} to real phone number`);
  } catch (error) {
    console.error("[LID Resolution] Error:", error);
  }
}

// Merge LID contact when real phone number arrives with matching pushName
async function mergeLidContactByPushName(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  realPhone: string,
  pushName: string,
  tenantId: string | null
// deno-lint-ignore no-explicit-any
): Promise<any | null> {
  try {
    console.log(`[LID Merge] Checking for LID contacts with pushName "${pushName}" to merge with phone ${realPhone}`);

    // Build query - search for LID-only contacts with the same pushName
    let query = supabaseClient
      .from("contacts")
      .select("id, whatsapp_lid, phone, name")
      .eq("name", pushName)
      .is("phone", null)
      .not("whatsapp_lid", "is", null);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: lidContacts } = await query;

    if (!lidContacts || lidContacts.length === 0) {
      console.log("[LID Merge] No LID contacts found with matching pushName");
      return null;
    }

    if (lidContacts.length > 1) {
      console.log(`[LID Merge] Found ${lidContacts.length} LID contacts with same pushName - ambiguous, skipping merge`);
      return null;
    }

    // Exactly one match - merge
    const lidContact = lidContacts[0];
    console.log(`[LID Merge] ✅ Merging LID contact ${lidContact.id} (LID: ${lidContact.whatsapp_lid}) with phone: ${realPhone}`);

    await supabaseClient
      .from("contacts")
      .update({ phone: realPhone, updated_at: new Date().toISOString() })
      .eq("id", lidContact.id);

    return { ...lidContact, phone: realPhone };
  } catch (error) {
    console.error("[LID Merge] Error:", error);
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log("[Baileys Webhook] ✅ Function called! Event:", payload?.event, "Session:", payload?.session);
    console.log("[Baileys Webhook] Full payload:", JSON.stringify(payload).substring(0, 500));

    const { event, session, payload: eventPayload } = payload;

    if (!session) {
      console.log("[Baileys Webhook] No session in payload, ignoring");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find connection by session name
    const { data: connections } = await supabaseClient
      .from("connections")
      .select("*")
      .eq("type", "whatsapp");

    const connection = connections?.find((c: { session_data: { sessionName?: string; engine?: string } | null }) => {
      const sessionData = c.session_data;
      return sessionData?.sessionName === session && sessionData?.engine === "baileys";
    });

    if (!connection) {
      console.log(`[Baileys Webhook] Connection not found for session: ${session}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Baileys Webhook] Found connection: ${connection.id} (${connection.name})`);

    // ... keep existing code (all event handlers: qr.update, session.status, message)
  } catch (error) {
    console.error("[Baileys Webhook] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
Deno.serve(handler);
