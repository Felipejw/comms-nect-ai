// ===========================================
// Sync Contacts - Sincroniza contatos do WhatsApp via Baileys
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[sync-contacts] Starting contact sync...");

    // 1. Buscar conexões ativas do tipo Baileys
    const { data: connections, error: connError } = await supabase
      .from("connections")
      .select("id, name, status, session_data, type")
      .eq("status", "connected");

    if (connError) {
      console.error("[sync-contacts] Error fetching connections:", connError.message);
      return new Response(
        JSON.stringify({ error: connError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!connections || connections.length === 0) {
      console.log("[sync-contacts] No active connections found");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma conexão ativa", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar URL do Baileys
    const { data: baileysSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_url")
      .maybeSingle();

    const baileysUrl = baileysSettings?.value || "http://baileys:3001";

    let totalSynced = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const details: string[] = [];

    // 3. Para cada conexão, buscar contatos do Baileys
    for (const conn of connections) {
      const sessionName = conn.name || conn.id;
      console.log(`[sync-contacts] Syncing contacts for session: ${sessionName}`);

      try {
        const response = await fetch(`${baileysUrl}/api/contacts/${sessionName}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[sync-contacts] Failed to fetch contacts from Baileys for ${sessionName}: ${errorText}`);
          details.push(`${sessionName}: falha ao buscar contatos do Baileys`);
          continue;
        }

        const contactsData = await response.json();
        const contacts = contactsData.contacts || contactsData || [];

        if (!Array.isArray(contacts) || contacts.length === 0) {
          console.log(`[sync-contacts] No contacts returned for ${sessionName}`);
          details.push(`${sessionName}: nenhum contato retornado`);
          continue;
        }

        console.log(`[sync-contacts] Got ${contacts.length} contacts from ${sessionName}`);

        // 4. Processar cada contato
        for (const contact of contacts) {
          try {
            const jid = contact.id || contact.jid || "";
            if (!jid || jid.includes("@g.us") || jid.includes("@broadcast") || jid === "status@broadcast") {
              continue; // Ignorar grupos e broadcasts
            }

            // Extrair telefone do JID (formato: 5511999999999@s.whatsapp.net)
            const phone = jid.split("@")[0]?.replace(/\D/g, "") || "";
            if (!phone || phone.length < 8) continue;

            const contactName = contact.name || contact.notify || contact.pushName || phone;
            const avatarUrl = contact.imgUrl || contact.profilePicUrl || null;

            // Verificar se phone é um LID (muito longo)
            const isLid = phone.length > 15;

            // 5. Upsert no banco de dados
            if (isLid) {
              // É um LID - verificar se já existe contato com esse LID
              const { data: existing } = await supabase
                .from("contacts")
                .select("id")
                .eq("whatsapp_lid", phone)
                .maybeSingle();

              if (existing) {
                // Atualizar nome se o atual é placeholder
                const { error: updateErr } = await supabase
                  .from("contacts")
                  .update({
                    name: contactName,
                    avatar_url: avatarUrl || undefined,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id)
                  .is("name", null);

                // Se name não é null, atualizar só se for placeholder
                if (updateErr) {
                  await supabase
                    .from("contacts")
                    .update({ avatar_url: avatarUrl || undefined })
                    .eq("id", existing.id);
                }
                totalUpdated++;
              } else {
                // Criar contato com LID (sem telefone real)
                const { error: insertErr } = await supabase
                  .from("contacts")
                  .insert({
                    name: contactName,
                    whatsapp_lid: phone,
                    avatar_url: avatarUrl,
                    status: "active",
                  });

                if (insertErr) {
                  // Pode ser duplicata do trigger prevent_duplicate_contacts
                  if (!insertErr.message.includes("duplicate")) {
                    console.warn(`[sync-contacts] Error inserting LID contact: ${insertErr.message}`);
                    totalFailed++;
                  }
                } else {
                  totalSynced++;
                }
              }
            } else {
              // Telefone normal
              const { data: existing } = await supabase
                .from("contacts")
                .select("id, name, name_source")
                .eq("phone", phone)
                .maybeSingle();

              if (existing) {
                // Atualizar se nome é placeholder
                const badNames = ["Chatbot Whats", "Contato Desconhecido"];
                const isPlaceholder = badNames.includes(existing.name) ||
                  existing.name === phone ||
                  /^\d{14,}$/.test(existing.name);

                const updates: any = {
                  updated_at: new Date().toISOString(),
                };

                if (avatarUrl) updates.avatar_url = avatarUrl;

                if (isPlaceholder && contactName !== phone) {
                  updates.name = contactName;
                  updates.name_source = "sync";
                }

                await supabase
                  .from("contacts")
                  .update(updates)
                  .eq("id", existing.id);

                totalUpdated++;
              } else {
                // Criar novo contato
                const { error: insertErr } = await supabase
                  .from("contacts")
                  .insert({
                    name: contactName,
                    phone,
                    avatar_url: avatarUrl,
                    status: "active",
                    name_source: "sync",
                  });

                if (insertErr) {
                  if (!insertErr.message.includes("duplicate")) {
                    console.warn(`[sync-contacts] Error inserting contact ${phone}: ${insertErr.message}`);
                    totalFailed++;
                  }
                } else {
                  totalSynced++;
                }
              }
            }
          } catch (contactErr) {
            console.warn(`[sync-contacts] Error processing contact:`, contactErr);
            totalFailed++;
          }
        }

        details.push(`${sessionName}: processados ${contacts.length} contatos`);
      } catch (sessionErr) {
        console.error(`[sync-contacts] Error syncing session ${sessionName}:`, sessionErr);
        details.push(`${sessionName}: erro - ${sessionErr instanceof Error ? sessionErr.message : "unknown"}`);
        totalFailed++;
      }
    }

    console.log(`[sync-contacts] Done: ${totalSynced} synced, ${totalUpdated} updated, ${totalFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        result: {
          total: totalSynced + totalUpdated + totalFailed,
          synced: totalSynced,
          updated: totalUpdated,
          failed: totalFailed,
          details,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[sync-contacts] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
