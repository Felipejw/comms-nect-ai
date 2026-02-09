// ===========================================
// Main Router - VPS Entry Point & Cloud Health Check
// Edge Runtime loads this automatically via --main-service /home/deno/functions
// Uses dynamic imports with ../ to reach sibling function folders
// ===========================================

console.log("[main-router] Booting...");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const VALID_FUNCTIONS = new Set([
  'admin-write',
  'baileys-create-session',
  'baileys-instance',
  'baileys-webhook',
  'check-connections',
  'create-user',
  'delete-user',
  'download-whatsapp-media',
  'execute-campaign',
  'execute-flow',
  'fetch-whatsapp-profile',
  'google-auth',
  'google-calendar',
  'merge-duplicate-contacts',
  'meta-api-webhook',
  'process-schedules',
  'reset-user-password',
  'resolve-lid-contact',
  'save-system-setting',
  'send-meta-message',
  'send-whatsapp',
  'sync-contacts',
  'update-lid-contacts',
  'update-user-email',
]);

const moduleCache = new Map<string, (req: Request) => Promise<Response>>();

async function loadFunction(name: string): Promise<(req: Request) => Promise<Response>> {
  const cached = moduleCache.get(name);
  if (cached) return cached;

  console.log(`[main-router] Loading function: ${name}`);
  // ../ because this file is inside main/ and siblings are at the same level
  const module = await import(`../${name}/index.ts`);
  const handler = module.default;
  moduleCache.set(name, handler);
  return handler;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Cloud mode: no path = health check (main function called directly)
  if (pathParts.length === 0) {
    return new Response(
      JSON.stringify({ status: 'ok', mode: 'cloud', version: '1.0.0', functions: VALID_FUNCTIONS.size }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let functionName: string | undefined;
  if (pathParts.length >= 3 && pathParts[0] === 'functions' && pathParts[1] === 'v1') {
    functionName = pathParts[2];
  } else if (pathParts.length >= 1) {
    functionName = pathParts[0];
  }

  if (!functionName) {
    return new Response(
      JSON.stringify({ error: 'Function name required', available: [...VALID_FUNCTIONS] }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (functionName === 'health' || functionName === '_health') {
    return new Response(
      JSON.stringify({ status: 'ok', functions: VALID_FUNCTIONS.size }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!VALID_FUNCTIONS.has(functionName)) {
    return new Response(
      JSON.stringify({ error: `Function '${functionName}' not found`, available: [...VALID_FUNCTIONS] }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const fnHandler = await loadFunction(functionName);

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

console.log(`[main-router] Ready. ${VALID_FUNCTIONS.size} functions registered.`);

export default handler;
if (import.meta.main) Deno.serve(handler);
