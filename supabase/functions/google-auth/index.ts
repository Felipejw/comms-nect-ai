import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, integration_id, code, redirect_uri } = await req.json();

    console.log(`[google-auth] Action: ${action}`);

    switch (action) {
      case "authorize": {
        // Get integration to retrieve client_id
        const { data: integration, error: intError } = await supabase
          .from("integrations")
          .select("*")
          .eq("id", integration_id)
          .single();

        if (intError || !integration) {
          console.error("[google-auth] Integration not found:", intError);
          return new Response(
            JSON.stringify({ error: "Integração não encontrada" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const config = integration.config as Record<string, string>;
        const clientId = config?.client_id;

        if (!clientId) {
          return new Response(
            JSON.stringify({ error: "Client ID não configurado" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Build authorization URL
        const scopes = [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ];

        const state = JSON.stringify({ integration_id });
        
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri,
          response_type: "code",
          scope: scopes.join(" "),
          access_type: "offline",
          prompt: "consent",
          state: encodeURIComponent(state),
        });

        const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

        console.log("[google-auth] Generated auth URL");

        return new Response(
          JSON.stringify({ auth_url: authUrl }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "callback": {
        // Exchange authorization code for tokens
        const { data: integration, error: intError } = await supabase
          .from("integrations")
          .select("*")
          .eq("id", integration_id)
          .single();

        if (intError || !integration) {
          console.error("[google-auth] Integration not found:", intError);
          return new Response(
            JSON.stringify({ error: "Integração não encontrada" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const config = integration.config as Record<string, string>;
        const clientId = config?.client_id;
        const clientSecret = config?.client_secret;

        if (!clientId || !clientSecret) {
          return new Response(
            JSON.stringify({ error: "Credenciais não configuradas" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Exchange code for tokens
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri,
          }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
          console.error("[google-auth] Token exchange error:", tokenData);
          return new Response(
            JSON.stringify({ error: tokenData.error_description || "Erro ao obter tokens" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log("[google-auth] Token exchange successful");

        // Get user info
        const userResponse = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        const userData = await userResponse.json();

        if (!userResponse.ok) {
          console.error("[google-auth] User info error:", userData);
          return new Response(
            JSON.stringify({ error: "Erro ao obter informações do usuário" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log("[google-auth] Got user info:", userData.email);

        // Calculate token expiration
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

        // Update integration with tokens
        const updatedConfig = {
          ...config,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || config.refresh_token,
          expires_at: expiresAt,
          connected_email: userData.email,
        };

        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            config: updatedConfig,
            is_active: true,
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration_id);

        if (updateError) {
          console.error("[google-auth] Update error:", updateError);
          return new Response(
            JSON.stringify({ error: "Erro ao salvar tokens" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            email: userData.email,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "refresh": {
        // Refresh expired access token
        const { data: integration, error: intError } = await supabase
          .from("integrations")
          .select("*")
          .eq("id", integration_id)
          .single();

        if (intError || !integration) {
          return new Response(
            JSON.stringify({ error: "Integração não encontrada" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const config = integration.config as Record<string, string>;
        const { client_id, client_secret, refresh_token } = config;

        if (!refresh_token) {
          return new Response(
            JSON.stringify({ error: "Refresh token não disponível" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id,
            client_secret,
            refresh_token,
            grant_type: "refresh_token",
          }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
          console.error("[google-auth] Refresh error:", tokenData);
          return new Response(
            JSON.stringify({ error: "Erro ao renovar token" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

        const updatedConfig = {
          ...config,
          access_token: tokenData.access_token,
          expires_at: expiresAt,
        };

        await supabase
          .from("integrations")
          .update({
            config: updatedConfig,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration_id);

        return new Response(
          JSON.stringify({ success: true, access_token: tokenData.access_token }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        // Disconnect Google account
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            config: {
              client_id: null,
              client_secret: null,
            },
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration_id);

        if (updateError) {
          console.error("[google-auth] Disconnect error:", updateError);
          return new Response(
            JSON.stringify({ error: "Erro ao desconectar" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Ação inválida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("[google-auth] Error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
