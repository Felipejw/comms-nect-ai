// ===========================================
// Edge Functions Router (Self-Hosted VPS Only)
// This file is the entry point for --main-service /home/deno/functions
// It is NOT deployed to Cloud (only subdirectories are deployed)
// ===========================================

console.log("[main-router] Booting...");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Static imports using ./ paths (within sandbox scope)
import adminWriteHandler from './admin-write/index.ts';
import baileysCreateSessionHandler from './baileys-create-session/index.ts';
import baileysInstanceHandler from './baileys-instance/index.ts';
import baileysWebhookHandler from './baileys-webhook/index.ts';
import checkConnectionsHandler from './check-connections/index.ts';
import createUserHandler from './create-user/index.ts';
import deleteUserHandler from './delete-user/index.ts';
import downloadWhatsappMediaHandler from './download-whatsapp-media/index.ts';
import executeCampaignHandler from './execute-campaign/index.ts';
import executeFlowHandler from './execute-flow/index.ts';
import fetchWhatsappProfileHandler from './fetch-whatsapp-profile/index.ts';
import googleAuthHandler from './google-auth/index.ts';
import googleCalendarHandler from './google-calendar/index.ts';
import mergeDuplicateContactsHandler from './merge-duplicate-contacts/index.ts';
import metaApiWebhookHandler from './meta-api-webhook/index.ts';
import processSchedulesHandler from './process-schedules/index.ts';
import resetUserPasswordHandler from './reset-user-password/index.ts';
import resolveLidContactHandler from './resolve-lid-contact/index.ts';
import saveSystemSettingHandler from './save-system-setting/index.ts';
import sendMetaMessageHandler from './send-meta-message/index.ts';
import sendWhatsappHandler from './send-whatsapp/index.ts';
import syncContactsHandler from './sync-contacts/index.ts';
import updateLidContactsHandler from './update-lid-contacts/index.ts';
import updateUserEmailHandler from './update-user-email/index.ts';

const FUNCTION_HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  'admin-write': adminWriteHandler,
  'baileys-create-session': baileysCreateSessionHandler,
  'baileys-instance': baileysInstanceHandler,
  'baileys-webhook': baileysWebhookHandler,
  'check-connections': checkConnectionsHandler,
  'create-user': createUserHandler,
  'delete-user': deleteUserHandler,
  'download-whatsapp-media': downloadWhatsappMediaHandler,
  'execute-campaign': executeCampaignHandler,
  'execute-flow': executeFlowHandler,
  'fetch-whatsapp-profile': fetchWhatsappProfileHandler,
  'google-auth': googleAuthHandler,
  'google-calendar': googleCalendarHandler,
  'merge-duplicate-contacts': mergeDuplicateContactsHandler,
  'meta-api-webhook': metaApiWebhookHandler,
  'process-schedules': processSchedulesHandler,
  'reset-user-password': resetUserPasswordHandler,
  'resolve-lid-contact': resolveLidContactHandler,
  'save-system-setting': saveSystemSettingHandler,
  'send-meta-message': sendMetaMessageHandler,
  'send-whatsapp': sendWhatsappHandler,
  'sync-contacts': syncContactsHandler,
  'update-lid-contacts': updateLidContactsHandler,
  'update-user-email': updateUserEmailHandler,
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  let functionName: string | undefined;
  if (pathParts.length >= 3 && pathParts[0] === 'functions' && pathParts[1] === 'v1') {
    functionName = pathParts[2];
  } else if (pathParts.length >= 1) {
    functionName = pathParts[0];
  }

  if (!functionName) {
    return new Response(
      JSON.stringify({ error: 'Function name required', available: Object.keys(FUNCTION_HANDLERS) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (functionName === 'health' || functionName === '_health') {
    return new Response(
      JSON.stringify({ status: 'ok', functions: Object.keys(FUNCTION_HANDLERS).length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const fnHandler = FUNCTION_HANDLERS[functionName];
  if (!fnHandler) {
    return new Response(
      JSON.stringify({ error: `Function '${functionName}' not found`, available: Object.keys(FUNCTION_HANDLERS) }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const functionUrl = new URL(req.url);
    const remainingPath = pathParts.slice(pathParts[0] === 'functions' ? 3 : 1).join('/');
    functionUrl.pathname = remainingPath ? `/${remainingPath}` : '/';

    const proxyReq = new Request(functionUrl.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });

    const response = await fnHandler(proxyReq);
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    console.error(`[main-router] Error executing '${functionName}':`, error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        function: functionName,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

console.log(`[main-router] Ready. ${Object.keys(FUNCTION_HANDLERS).length} functions registered.`);

Deno.serve(handler);
