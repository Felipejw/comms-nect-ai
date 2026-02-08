import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Detect SSL/TLS errors and retry with HTTP fallback
function isSSLError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("certificate") ||
    msg.includes("ssl") ||
    msg.includes("tls") ||
    msg.includes("peer") ||
    msg.includes("handshake") ||
    msg.includes("secure connection") ||
    (error.name === "TypeError" && msg.includes("error sending request"))
  );
}

async function resilientFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (isSSLError(error)) {
      const httpUrl = url.replace("https://", "http://");
      console.warn(`[Baileys Session] SSL error on ${url}, retrying with HTTP: ${httpUrl}`);
      console.warn(`[Baileys Session] Original error: ${error instanceof Error ? error.message : error}`);
      return await fetch(httpUrl, options);
    }
    throw error;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { connectionId, sessionName, webhookUrl, baileysUrl, baileysApiKey } = await req.json();
    
    console.log(`[Baileys Session] Starting session creation for: ${sessionName}`);
    console.log(`[Baileys Session] Connection ID: ${connectionId}`);
    console.log(`[Baileys Session] Baileys URL: ${baileysUrl}`);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (baileysApiKey) {
      headers["X-API-Key"] = baileysApiKey;
    }

    // Timeout de 55 segundos para permitir que o servidor Baileys inicialize a sessão
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    try {
      console.log(`[Baileys Session] Calling POST ${baileysUrl}/sessions`);
      
      const response = await resilientFetch(`${baileysUrl}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: sessionName, webhookUrl }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const result = await response.json();
      console.log(`[Baileys Session] Response status: ${response.status}`);
      console.log(`[Baileys Session] Result:`, result.success ? "success" : result.error || "unknown error");

      if (!result.success) {
        console.error(`[Baileys Session] Server returned error:`, result.error);
        await supabaseClient
          .from("connections")
          .update({ 
            status: "error", 
            updated_at: new Date().toISOString() 
          })
          .eq("id", connectionId);
      } else {
        console.log(`[Baileys Session] Session created successfully`);
        
        // Log activity - get tenant_id from connection
        const { data: conn } = await supabaseClient
          .from("connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        await supabaseClient.from("activity_logs").insert({
          action: "create",
          entity_type: "session",
          entity_id: connectionId,
          metadata: { session_name: sessionName },
        });
      }

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      const isTimeout = fetchError instanceof Error && fetchError.name === "AbortError";
      const errorMessage = isTimeout 
        ? "Timeout após 55 segundos aguardando servidor Baileys" 
        : fetchError instanceof Error ? fetchError.message : String(fetchError);
      
      console.error(`[Baileys Session] ${isTimeout ? 'Timeout' : 'Fetch error'}:`, errorMessage);
      
      if (!isTimeout) {
        await supabaseClient
          .from("connections")
          .update({ 
            status: "error", 
            updated_at: new Date().toISOString() 
          })
          .eq("id", connectionId);
      }

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: isTimeout ? 408 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("[Baileys Session] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
Deno.serve(handler);
