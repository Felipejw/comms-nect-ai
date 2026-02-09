// ===========================================
// Check Connections - Health check periódico das conexões WhatsApp
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[check-connections] Starting connection health check...");

    // 1. Buscar todas as conexões que não estão em estado "disconnected"
    const { data: connections, error: connError } = await supabaseAdmin
      .from("connections")
      .select("id, name, status, type, phone_number, updated_at, session_data")
      .neq("status", "disconnected");

    if (connError) {
      console.error("[check-connections] Error fetching connections:", connError.message);
      return new Response(
        JSON.stringify({ success: false, error: connError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!connections || connections.length === 0) {
      console.log("[check-connections] No active connections to check");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma conexão ativa", checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[check-connections] Checking ${connections.length} connections`);

    // 2. Buscar URL do Baileys
    const { data: baileysSettings } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "baileys_api_url")
      .maybeSingle();

    const baileysUrl = baileysSettings?.value || "http://baileys:3001";

    const results: Array<{
      id: string;
      name: string;
      previousStatus: string;
      currentStatus: string;
      changed: boolean;
    }> = [];

    // 3. Para cada conexão, verificar status no Baileys
    for (const conn of connections) {
      const sessionName = conn.name || conn.id;
      let currentStatus = "disconnected";

      try {
        // Verificar se deve desconectar
        if (conn.disconnect_requested) {
          console.log(`[check-connections] Disconnect requested for ${sessionName}`);

          // Enviar comando de desconexão ao Baileys
          try {
            await fetch(`${baileysUrl}/api/session/${sessionName}/disconnect`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            });
          } catch (e) {
            console.warn(`[check-connections] Failed to send disconnect to Baileys: ${e}`);
          }

          // Atualizar no banco
          await supabaseAdmin
            .from("connections")
            .update({
              status: "disconnected",
              disconnect_requested: false,
              qr_code: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conn.id);

          results.push({
            id: conn.id,
            name: sessionName,
            previousStatus: conn.status || "unknown",
            currentStatus: "disconnected",
            changed: true,
          });
          continue;
        }

        // Consultar status no Baileys
        const statusResponse = await fetch(
          `${baileysUrl}/api/session/${sessionName}/status`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          currentStatus = statusData.status || statusData.state || "disconnected";

          // Normalizar status
          if (currentStatus === "open" || currentStatus === "connected" || currentStatus === "active") {
            currentStatus = "connected";
          } else if (currentStatus === "connecting" || currentStatus === "qr" || currentStatus === "waiting_qr") {
            currentStatus = "connecting";
          } else if (currentStatus === "close" || currentStatus === "closed" || currentStatus === "error") {
            currentStatus = "disconnected";
          }

          // Atualizar telefone se disponível
          if (statusData.phone_number || statusData.phoneNumber || statusData.jid) {
            const phone = statusData.phone_number || statusData.phoneNumber || statusData.jid?.split("@")[0];
            if (phone && phone !== conn.phone_number) {
              await supabaseAdmin
                .from("connections")
                .update({ phone_number: phone })
                .eq("id", conn.id);
            }
          }
        } else {
          console.warn(`[check-connections] Baileys returned ${statusResponse.status} for ${sessionName}`);
          
          // Se Baileys retorna 404, a sessão não existe mais
          if (statusResponse.status === 404) {
            currentStatus = "disconnected";
          } else {
            // Para outros erros, manter status atual para não perder estado por erro temporário
            currentStatus = conn.status || "disconnected";
          }
        }
      } catch (fetchErr) {
        console.warn(`[check-connections] Error reaching Baileys for ${sessionName}:`, fetchErr);
        // Se o Baileys está offline, marcar conexões ativas como erro
        // mas NÃO desconectar (pode ser restart temporário)
        if (conn.status === "connected") {
          // Verificar se faz mais de 5 minutos sem update
          const lastUpdate = new Date(conn.updated_at).getTime();
          const now = Date.now();
          const fiveMinutes = 5 * 60 * 1000;

          if (now - lastUpdate > fiveMinutes) {
            currentStatus = "disconnected";
          } else {
            currentStatus = conn.status || "connected"; // Manter por enquanto
          }
        } else {
          currentStatus = conn.status || "disconnected";
        }
      }

      // 4. Atualizar status se mudou
      const changed = currentStatus !== conn.status;
      if (changed) {
        console.log(`[check-connections] ${sessionName}: ${conn.status} -> ${currentStatus}`);

        const updateData: any = {
          status: currentStatus,
          updated_at: new Date().toISOString(),
        };

        // Limpar QR code se desconectou
        if (currentStatus === "disconnected") {
          updateData.qr_code = null;
        }

        await supabaseAdmin
          .from("connections")
          .update(updateData)
          .eq("id", conn.id);
      }

      results.push({
        id: conn.id,
        name: sessionName,
        previousStatus: conn.status || "unknown",
        currentStatus,
        changed,
      });
    }

    const changedCount = results.filter((r) => r.changed).length;
    console.log(
      `[check-connections] Done: ${results.length} checked, ${changedCount} changed`
    );

    return new Response(
      JSON.stringify({
        success: true,
        checked: results.length,
        changed: changedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[check-connections] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
Deno.serve(handler);
