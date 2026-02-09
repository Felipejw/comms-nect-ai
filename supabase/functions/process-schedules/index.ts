// ===========================================
// Process Schedules - Processa agendamentos pendentes
// Envia mensagens programadas e atualiza status
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();
    console.log(`[process-schedules] Processing schedules at: ${now}`);

    // 1. Buscar agendamentos pendentes com horário já passado
    const { data: pendingSchedules, error: fetchError } = await supabase
      .from("schedules")
      .select(`
        id, title, description, message_content, scheduled_at,
        reminder, reminder_sent, status, user_id,
        contact_id, conversation_id,
        contacts(id, name, phone, whatsapp_lid)
      `)
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error("[process-schedules] Error fetching schedules:", fetchError.message);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pendingSchedules || pendingSchedules.length === 0) {
      console.log("[process-schedules] No pending schedules");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "Nenhum agendamento pendente" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[process-schedules] Found ${pendingSchedules.length} pending schedules`);

    let processed = 0;
    let sent = 0;
    let failed = 0;
    const details: string[] = [];

    // 2. Verificar se há conexão ativa
    const { data: connections } = await supabase
      .from("connections")
      .select("id, name")
      .eq("status", "connected")
      .limit(1);

    const hasConnection = connections && connections.length > 0;
    const connectionId = hasConnection ? connections[0].id : null;

    // 3. Processar cada agendamento
    for (const schedule of pendingSchedules) {
      processed++;
      const contact = schedule.contacts as any;

      console.log(
        `[process-schedules] Processing: "${schedule.title}" for contact ${schedule.contact_id}`
      );

      try {
        // Se tem mensagem para enviar e tem contato com telefone
        if (schedule.message_content && contact && (contact.phone || contact.whatsapp_lid)) {
          if (!hasConnection) {
            console.warn("[process-schedules] No WhatsApp connection, skipping message send");
            details.push(`${schedule.title}: sem conexão WhatsApp ativa`);

            // Marcar como concluído mesmo sem enviar (é agendamento, não campanha)
            await supabase
              .from("schedules")
              .update({
                status: "completed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", schedule.id);

            processed++;
            continue;
          }

          // Buscar ou criar conversa
          let conversationId = schedule.conversation_id;

          if (!conversationId && contact) {
            // Buscar conversa existente do contato
            const { data: existingConv } = await supabase
              .from("conversations")
              .select("id")
              .eq("contact_id", contact.id)
              .order("last_message_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (existingConv) {
              conversationId = existingConv.id;
            } else {
              // Criar nova conversa
              const { data: newConv } = await supabase
                .from("conversations")
                .insert({
                  contact_id: contact.id,
                  connection_id: connectionId,
                  status: "in_progress",
                  channel: "whatsapp",
                  is_bot_active: false,
                })
                .select("id")
                .single();

              if (newConv) {
                conversationId = newConv.id;
              }
            }
          }

          if (conversationId) {
            // Enviar mensagem via send-whatsapp
            const { error: sendError } = await supabase.functions.invoke("send-whatsapp", {
              body: {
                conversationId,
                content: schedule.message_content,
                messageType: "text",
              },
            });

            if (sendError) {
              console.error(`[process-schedules] Error sending message for schedule ${schedule.id}:`, sendError);
              details.push(`${schedule.title}: erro ao enviar - ${sendError.message}`);
              failed++;

              // Não marcar como falho - tentar novamente na próxima execução
              // Apenas registrar o erro
              continue;
            }

            console.log(`[process-schedules] Message sent for schedule ${schedule.id}`);
            sent++;
          }
        }

        // 4. Marcar agendamento como concluído
        await supabase
          .from("schedules")
          .update({
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", schedule.id);

        details.push(`${schedule.title}: concluído`);
      } catch (scheduleErr) {
        console.error(`[process-schedules] Error processing schedule ${schedule.id}:`, scheduleErr);
        failed++;
        details.push(
          `${schedule.title}: erro - ${scheduleErr instanceof Error ? scheduleErr.message : "unknown"}`
        );
      }
    }

    // 5. Processar lembretes (agendamentos futuros com reminder=true)
    const reminderWindow = new Date();
    reminderWindow.setMinutes(reminderWindow.getMinutes() + 30); // 30 min antes

    const { data: upcomingSchedules } = await supabase
      .from("schedules")
      .select(`
        id, title, scheduled_at, reminder, reminder_sent, user_id,
        contact_id, conversation_id,
        contacts(id, name, phone)
      `)
      .eq("status", "pending")
      .eq("reminder", true)
      .eq("reminder_sent", false)
      .lte("scheduled_at", reminderWindow.toISOString())
      .gt("scheduled_at", now)
      .limit(20);

    let remindersSent = 0;

    if (upcomingSchedules && upcomingSchedules.length > 0) {
      console.log(`[process-schedules] ${upcomingSchedules.length} reminders to send`);

      for (const schedule of upcomingSchedules) {
        try {
          // Criar mensagem de chat interno para o atendente
          if (schedule.user_id) {
            const contact = schedule.contacts as any;
            const contactName = contact?.name || "contato";
            const scheduledTime = new Date(schedule.scheduled_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            });

            // Inserir notificação via chat_messages (do sistema para o atendente)
            await supabase.from("chat_messages").insert({
              sender_id: schedule.user_id, // auto-mensagem
              receiver_id: schedule.user_id,
              content: `⏰ Lembrete: "${schedule.title}" com ${contactName} às ${scheduledTime}`,
              is_read: false,
            });

            // Marcar lembrete como enviado
            await supabase
              .from("schedules")
              .update({ reminder_sent: true })
              .eq("id", schedule.id);

            remindersSent++;
          }
        } catch (reminderErr) {
          console.warn(`[process-schedules] Error sending reminder for ${schedule.id}:`, reminderErr);
        }
      }
    }

    console.log(
      `[process-schedules] Done: ${processed} processed, ${sent} messages sent, ${failed} failed, ${remindersSent} reminders`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        sent,
        failed,
        remindersSent,
        details,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[process-schedules] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
