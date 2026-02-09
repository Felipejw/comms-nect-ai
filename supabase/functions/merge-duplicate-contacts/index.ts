// ===========================================
// Merge Duplicate Contacts - Limpeza de contatos duplicados
// Identifica por telefone, mescla conversas/tags, remove duplicatas
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MergeResult {
  total: number;
  merged: number;
  updated: number;
  failed: number;
  details: string[];
}

const handler = async (req: Request): Promise<Response> => {
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

    // 1. Buscar todos os contatos com telefone não nulo
    const { data: allContacts, error: fetchError } = await supabase
      .from("contacts")
      .select("id, name, phone, whatsapp_lid, avatar_url, email, company, notes, name_source, created_at, last_contact_at")
      .not("phone", "is", null)
      .neq("phone", "")
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("[MergeContacts] Error fetching contacts:", fetchError.message);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!allContacts || allContacts.length === 0) {
      console.log("[MergeContacts] No contacts found");
      return new Response(
        JSON.stringify({ success: true, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[MergeContacts] Found ${allContacts.length} contacts with phone numbers`);

    // 2. Agrupar contatos por telefone normalizado
    const phoneGroups = new Map<string, typeof allContacts>();

    for (const contact of allContacts) {
      const normalizedPhone = contact.phone!.replace(/\D/g, "");
      if (normalizedPhone.length < 8 || normalizedPhone.length > 15) continue;

      if (!phoneGroups.has(normalizedPhone)) {
        phoneGroups.set(normalizedPhone, []);
      }
      phoneGroups.get(normalizedPhone)!.push(contact);
    }

    // 3. Processar apenas grupos com duplicatas
    const duplicateGroups = Array.from(phoneGroups.entries()).filter(
      ([, contacts]) => contacts.length > 1
    );

    result.total = duplicateGroups.length;
    console.log(`[MergeContacts] Found ${duplicateGroups.length} phone numbers with duplicates`);

    for (const [phone, contacts] of duplicateGroups) {
      try {
        // Escolher o "melhor" contato como principal (priorizar por qualidade dos dados)
        const primary = choosePrimaryContact(contacts);
        const duplicates = contacts.filter((c) => c.id !== primary.id);

        console.log(
          `[MergeContacts] Phone ${phone}: keeping ${primary.id} (${primary.name}), merging ${duplicates.length} duplicates`
        );

        for (const dup of duplicates) {
          // 4a. Migrar conversas do duplicado para o principal
          const { error: convError } = await supabase
            .from("conversations")
            .update({ contact_id: primary.id })
            .eq("contact_id", dup.id);

          if (convError) {
            console.warn(`[MergeContacts] Error migrating conversations for ${dup.id}: ${convError.message}`);
          }

          // 4b. Migrar tags do contato duplicado
          const { data: dupTags } = await supabase
            .from("contact_tags")
            .select("tag_id")
            .eq("contact_id", dup.id);

          if (dupTags && dupTags.length > 0) {
            // Buscar tags já existentes no contato principal
            const { data: primaryTags } = await supabase
              .from("contact_tags")
              .select("tag_id")
              .eq("contact_id", primary.id);

            const existingTagIds = new Set((primaryTags || []).map((t) => t.tag_id));

            // Adicionar apenas tags que não existem
            const newTags = dupTags.filter((t) => !existingTagIds.has(t.tag_id));
            if (newTags.length > 0) {
              await supabase.from("contact_tags").insert(
                newTags.map((t) => ({
                  contact_id: primary.id,
                  tag_id: t.tag_id,
                }))
              );
            }

            // Remover tags do duplicado
            await supabase.from("contact_tags").delete().eq("contact_id", dup.id);
          }

          // 4c. Migrar agendamentos
          await supabase
            .from("schedules")
            .update({ contact_id: primary.id })
            .eq("contact_id", dup.id);

          // 4d. Migrar campaign_contacts
          await supabase
            .from("campaign_contacts")
            .update({ contact_id: primary.id })
            .eq("contact_id", dup.id);

          // 4e. Migrar google_calendar_events
          await supabase
            .from("google_calendar_events")
            .update({ contact_id: primary.id })
            .eq("contact_id", dup.id);

          // 5. Enriquecer o contato principal com dados do duplicado
          const enrichUpdates: any = {};

          if (!primary.whatsapp_lid && dup.whatsapp_lid) {
            enrichUpdates.whatsapp_lid = dup.whatsapp_lid;
          }
          if (!primary.avatar_url && dup.avatar_url) {
            enrichUpdates.avatar_url = dup.avatar_url;
          }
          if (!primary.email && dup.email) {
            enrichUpdates.email = dup.email;
          }
          if (!primary.company && dup.company) {
            enrichUpdates.company = dup.company;
          }
          if (!primary.notes && dup.notes) {
            enrichUpdates.notes = dup.notes;
          }
          // Usar o last_contact_at mais recente
          if (dup.last_contact_at && (!primary.last_contact_at || dup.last_contact_at > primary.last_contact_at)) {
            enrichUpdates.last_contact_at = dup.last_contact_at;
          }

          if (Object.keys(enrichUpdates).length > 0) {
            enrichUpdates.updated_at = new Date().toISOString();
            await supabase.from("contacts").update(enrichUpdates).eq("id", primary.id);
          }

          // 6. Excluir o contato duplicado
          const { error: deleteError } = await supabase
            .from("contacts")
            .delete()
            .eq("id", dup.id);

          if (deleteError) {
            console.warn(`[MergeContacts] Error deleting duplicate ${dup.id}: ${deleteError.message}`);
            result.failed++;
          }
        }

        result.merged++;
        result.details.push(
          `${phone}: mesclou ${duplicates.length} duplicata(s) → ${primary.name} (${primary.id})`
        );
      } catch (groupErr) {
        console.error(`[MergeContacts] Error processing phone ${phone}:`, groupErr);
        result.failed++;
        result.details.push(`${phone}: erro - ${groupErr instanceof Error ? groupErr.message : "unknown"}`);
      }
    }

    // 7. Atualizar contatos com nome placeholder
    const { data: placeholderContacts } = await supabase
      .from("contacts")
      .select("id, name, phone, whatsapp_lid")
      .or("name.eq.Chatbot Whats,name.eq.Contato Desconhecido");

    if (placeholderContacts && placeholderContacts.length > 0) {
      for (const contact of placeholderContacts) {
        if (contact.phone) {
          // Usar telefone formatado como nome temporário
          const formattedPhone = contact.phone.replace(
            /(\d{2})(\d{2})(\d{5})(\d{4})/,
            "+$1 ($2) $3-$4"
          );
          await supabase
            .from("contacts")
            .update({ name: formattedPhone, name_source: "phone" })
            .eq("id", contact.id);
          result.updated++;
        }
      }
    }

    console.log(
      `[MergeContacts] Done: ${result.merged} merged, ${result.updated} updated, ${result.failed} failed`
    );

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[MergeContacts] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

/**
 * Escolhe o melhor contato para ser o "principal" em caso de duplicatas.
 * Prioriza: nome real > mais dados > mais recente atividade > mais antigo
 */
function choosePrimaryContact(contacts: any[]): any {
  return contacts.reduce((best, current) => {
    const bestScore = scoreContact(best);
    const currentScore = scoreContact(current);
    return currentScore > bestScore ? current : best;
  });
}

function scoreContact(contact: any): number {
  let score = 0;

  // Nome de qualidade (não placeholder)
  const badNames = ["Chatbot Whats", "Contato Desconhecido"];
  if (contact.name && !badNames.includes(contact.name) && !/^\d{10,}$/.test(contact.name)) {
    score += 10;
  }

  // Nome vindo de fonte confiável
  if (contact.name_source === "whatsapp" || contact.name_source === "user") {
    score += 5;
  }

  // Tem dados adicionais
  if (contact.avatar_url) score += 3;
  if (contact.email) score += 3;
  if (contact.company) score += 2;
  if (contact.notes) score += 2;
  if (contact.whatsapp_lid) score += 2;

  // Atividade recente
  if (contact.last_contact_at) {
    const daysSinceContact = (Date.now() - new Date(contact.last_contact_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceContact < 7) score += 5;
    else if (daysSinceContact < 30) score += 3;
    else score += 1;
  }

  return score;
}

export default handler;
Deno.serve(handler);
