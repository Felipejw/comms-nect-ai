import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const { action, connectionId, instanceName } = await req.json();
    console.log(`[Baileys Instance] Action: ${action}, ConnectionId: ${connectionId}`);

    // Buscar configuracao do servidor Baileys
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
      return new Response(
        JSON.stringify({ success: false, error: "Baileys server URL not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Headers para API Baileys
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (baileysApiKey) {
      headers["X-API-Key"] = baileysApiKey;
    }

    switch (action) {
      // ==========================================
      // Criar nova sessao
      // ==========================================
      case "create": {
        const name = instanceName?.toLowerCase().replace(/\s+/g, "_") || `session_${Date.now()}`;
        const webhookUrl = `${supabaseUrl}/functions/v1/baileys-webhook`;

        // Verificar se conexao ja existe
        const { data: existingConn } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("name", instanceName)
          .single();

        if (existingConn) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection with this name already exists" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Obter tenant do usuario PRIMEIRO (antes de qualquer chamada lenta)
        const authHeader = req.headers.get("Authorization");
        let tenantId = null;

        if (authHeader) {
          const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: { user } } = await userClient.auth.getUser();
          if (user) {
            const { data: profile } = await supabaseClient
              .from("profiles")
              .select("tenant_id")
              .eq("user_id", user.id)
              .single();
            tenantId = profile?.tenant_id;
          }
        }

        // Criar conexao no banco PRIMEIRO (resposta rápida)
        const { data: connection, error: connError } = await supabaseClient
          .from("connections")
          .insert({
            name: instanceName,
            type: "whatsapp",
            status: "connecting",
            session_data: { sessionName: name, engine: "baileys" },
            tenant_id: tenantId,
          })
          .select()
          .single();

        if (connError) {
          return new Response(
            JSON.stringify({ success: false, error: connError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[Baileys Instance] Connection record created: ${connection.id}, now creating session on Baileys server...`);

        // Criar sessao no servidor Baileys (fire-and-forget com EdgeRuntime.waitUntil se disponível)
        // Usamos Promise sem await para não bloquear a resposta
        const createBaileysSession = async () => {
          try {
            const response = await fetch(`${baileysUrl}/sessions`, {
              method: "POST",
              headers,
              body: JSON.stringify({ name, webhookUrl }),
            });
            const result = await response.json();
            console.log(`[Baileys Instance] Baileys session creation result:`, result.success ? "success" : result.error);
            
            if (!result.success) {
              // Atualizar conexão com status de erro
              await supabaseClient
                .from("connections")
                .update({ 
                  status: "error",
                  updated_at: new Date().toISOString() 
                })
                .eq("id", connection.id);
            }
          } catch (err) {
            console.error(`[Baileys Instance] Background session creation failed:`, err);
            await supabaseClient
              .from("connections")
              .update({ 
                status: "error",
                updated_at: new Date().toISOString() 
              })
              .eq("id", connection.id);
          }
        };

        // Executar em background sem bloquear a resposta
        // @ts-ignore - EdgeRuntime.waitUntil pode não existir em todos os ambientes
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(createBaileysSession());
        } else {
          // Fallback: executar sem await (fire-and-forget)
          createBaileysSession();
        }

        // Retornar imediatamente - sessão será criada em background
        console.log(`[Baileys Instance] Returning immediately, session creation in background`);
        return new Response(
          JSON.stringify({ success: true, data: connection }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==========================================
      // Obter QR Code
      // ==========================================
      case "getQrCode": {
        const { data: connection } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (!connection) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sessionData = connection.session_data as { sessionName?: string } | null;
        const sessionName = sessionData?.sessionName;

        if (!sessionName) {
          return new Response(
            JSON.stringify({ success: false, error: "Session name not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const response = await fetch(`${baileysUrl}/sessions/${sessionName}/qr`, {
          method: "GET",
          headers,
        });

        const result = await response.json();

        if (!result.success || !result.data?.qrCode) {
          return new Response(
            JSON.stringify({ success: false, error: "QR Code not available" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Atualizar QR code no banco
        await supabaseClient
          .from("connections")
          .update({ qr_code: result.data.qrCode, updated_at: new Date().toISOString() })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true, qrCode: result.data.qrCode }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==========================================
      // Verificar status
      // ==========================================
      case "status": {
        const { data: connection } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (!connection) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sessionData = connection.session_data as { sessionName?: string } | null;
        const sessionName = sessionData?.sessionName;

        if (!sessionName) {
          return new Response(
            JSON.stringify({ success: true, status: "disconnected" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const response = await fetch(`${baileysUrl}/sessions/${sessionName}`, {
          method: "GET",
          headers,
        });

        const result = await response.json();

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: true, status: "disconnected" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const status = result.data?.status === "connected" ? "connected" : 
                       result.data?.status === "connecting" ? "connecting" : "disconnected";

        // Atualizar status no banco
        await supabaseClient
          .from("connections")
          .update({
            status,
            phone_number: result.data?.phoneNumber || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true, status, phoneNumber: result.data?.phoneNumber }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==========================================
      // Desconectar
      // ==========================================
      case "disconnect": {
        const { data: connection } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (!connection) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sessionData = connection.session_data as { sessionName?: string } | null;
        const sessionName = sessionData?.sessionName;

        if (sessionName) {
          await fetch(`${baileysUrl}/sessions/${sessionName}`, {
            method: "DELETE",
            headers,
          });
        }

        // Atualizar status
        await supabaseClient
          .from("connections")
          .update({
            status: "disconnected",
            qr_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectionId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==========================================
      // Excluir conexao
      // ==========================================
      case "delete": {
        const { data: connection } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (connection) {
          const sessionData = connection.session_data as { sessionName?: string } | null;
          const sessionName = sessionData?.sessionName;

          if (sessionName) {
            await fetch(`${baileysUrl}/sessions/${sessionName}`, {
              method: "DELETE",
              headers,
            });
          }

          await supabaseClient.from("connections").delete().eq("id", connectionId);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==========================================
      // Reconectar
      // ==========================================
      case "recreate": {
        const { data: connection } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (!connection) {
          return new Response(
            JSON.stringify({ success: false, error: "Connection not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const oldSessionData = connection.session_data as { sessionName?: string } | null;
        const oldSessionName = oldSessionData?.sessionName;

        // Deletar sessao antiga
        if (oldSessionName) {
          await fetch(`${baileysUrl}/sessions/${oldSessionName}`, {
            method: "DELETE",
            headers,
          });
        }

        // Criar nova sessao
        const newSessionName = `${connection.name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
        const webhookUrl = `${supabaseUrl}/functions/v1/baileys-webhook`;

        const response = await fetch(`${baileysUrl}/sessions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ name: newSessionName, webhookUrl }),
        });

        const result = await response.json();

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: false, error: result.error }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Atualizar conexao com novo sessionName IMEDIATAMENTE
        console.log(`[Baileys Instance] Recreate: updating sessionName to ${newSessionName}`);
        await supabaseClient
          .from("connections")
          .update({
            status: "connecting",
            qr_code: null,
            session_data: { sessionName: newSessionName, engine: "baileys" },
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectionId);

        // Retornar imediatamente - QR será buscado via polling no frontend
        console.log(`[Baileys Instance] Recreate complete, returning immediately. QR will be fetched via polling.`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==========================================
      // Health check do servidor
      // ==========================================
      case "serverHealth": {
        const healthUrl = `${baileysUrl}/health`;
        console.log(`[Baileys Health] Checking: ${healthUrl}`);
        
        // Timeout de 10 segundos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        try {
          const response = await fetch(healthUrl, {
            method: "GET",
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          console.log(`[Baileys Health] Response status: ${response.status}`);
          
          // Verificar se a resposta foi bem sucedida
          if (!response.ok) {
            const text = await response.text();
            console.log(`[Baileys Health] Error response: ${text}`);
            return new Response(
              JSON.stringify({ 
                success: false, 
                error: `Server returned ${response.status}: ${text.substring(0, 200)}` 
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const text = await response.text();
          console.log(`[Baileys Health] Response body: ${text}`);
          
          // Tentar parsear como JSON
          let result;
          try {
            result = JSON.parse(text);
          } catch {
            // Se não for JSON, criar objeto com a resposta
            result = { status: "ok", raw: text };
          }

          return new Response(
            JSON.stringify({ success: true, data: result }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (error) {
          clearTimeout(timeoutId);
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isTimeout = error instanceof Error && error.name === "AbortError";
          console.error(`[Baileys Health] ${isTimeout ? 'Timeout' : 'Network error'}: ${errorMessage}`);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: isTimeout ? "Connection timeout (10s)" : `Connection failed: ${errorMessage}` 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[Baileys Instance] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
