// ===========================================
// Main Router - Edge Functions (Self-Hosted)
// Roteador principal para o Supabase Edge Runtime
// ===========================================

console.log("[main-router] Booting...");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Mapeamento de funções disponíveis
const FUNCTION_HANDLERS: Record<string, string> = {
  'admin-write': '../admin-write/index.ts',
  'baileys-create-session': '../baileys-create-session/index.ts',
  'baileys-instance': '../baileys-instance/index.ts',
  'baileys-webhook': '../baileys-webhook/index.ts',
  'check-connections': '../check-connections/index.ts',
  'create-user': '../create-user/index.ts',
  'delete-user': '../delete-user/index.ts',
  'download-whatsapp-media': '../download-whatsapp-media/index.ts',
  'execute-campaign': '../execute-campaign/index.ts',
  'execute-flow': '../execute-flow/index.ts',
  'fetch-whatsapp-profile': '../fetch-whatsapp-profile/index.ts',
  'google-auth': '../google-auth/index.ts',
  'google-calendar': '../google-calendar/index.ts',
  'merge-duplicate-contacts': '../merge-duplicate-contacts/index.ts',
  'meta-api-webhook': '../meta-api-webhook/index.ts',
  'process-schedules': '../process-schedules/index.ts',
  'reset-user-password': '../reset-user-password/index.ts',
  'resolve-lid-contact': '../resolve-lid-contact/index.ts',
  'save-system-setting': '../save-system-setting/index.ts',
  'send-meta-message': '../send-meta-message/index.ts',
  'send-whatsapp': '../send-whatsapp/index.ts',
  'sync-contacts': '../sync-contacts/index.ts',
  'update-lid-contacts': '../update-lid-contacts/index.ts',
  'update-user-email': '../update-user-email/index.ts',
};

// Cache de módulos importados
const moduleCache = new Map<string, (req: Request) => Promise<Response>>();

async function loadFunction(name: string): Promise<((req: Request) => Promise<Response>) | null> {
  if (moduleCache.has(name)) {
    return moduleCache.get(name)!;
  }

  const modulePath = FUNCTION_HANDLERS[name];
  if (!modulePath) {
    return null;
  }

  try {
    // Neutralize Deno.serve before importing sub-functions
    // to prevent them from hijacking the main router's handler
    const originalServe = Deno.serve;
    (Deno as any).serve = () => {};

    const module = await import(modulePath);

    // Restore original Deno.serve
    (Deno as any).serve = originalServe;

    // Edge functions export a default handler
    if (typeof module.default === 'function') {
      moduleCache.set(name, module.default);
      console.log(`[main-router] Loaded function: ${name}`);
      return module.default;
    }
    console.warn(`[main-router] Function '${name}' has no default export`);
    return null;
  } catch (error) {
    // Ensure Deno.serve is restored even on error
    if (typeof Deno.serve !== 'function') {
      console.error(`[main-router] Deno.serve was corrupted, cannot restore`);
    }
    console.error(`[main-router] Error loading function '${name}':`, error);
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Extract function name from path
  // Expected paths: /<function-name> or /functions/v1/<function-name>
  let functionName: string | undefined;

  if (pathParts.length >= 3 && pathParts[0] === 'functions' && pathParts[1] === 'v1') {
    functionName = pathParts[2];
  } else if (pathParts.length >= 1) {
    functionName = pathParts[0];
  }

  if (!functionName) {
    return new Response(
      JSON.stringify({ 
        error: 'Function name required',
        available: Object.keys(FUNCTION_HANDLERS),
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  // Health check endpoint
  if (functionName === 'health' || functionName === '_health') {
    return new Response(
      JSON.stringify({ status: 'ok', functions: Object.keys(FUNCTION_HANDLERS).length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check if function exists
  if (!FUNCTION_HANDLERS[functionName]) {
    return new Response(
      JSON.stringify({ 
        error: `Function '${functionName}' not found`,
        available: Object.keys(FUNCTION_HANDLERS),
      }),
      { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    // Build the internal URL for the function
    const functionUrl = new URL(req.url);
    
    // Remove the function name prefix from the path for the handler
    const remainingPath = pathParts.slice(
      pathParts[0] === 'functions' ? 3 : 1
    ).join('/');
    
    functionUrl.pathname = remainingPath ? `/${remainingPath}` : '/';

    // Create a new request with the adjusted URL
    const proxyReq = new Request(functionUrl.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });

    // Try to dynamically import and call the function
    const fnHandler = await loadFunction(functionName);
    if (fnHandler) {
      const response = await fnHandler(proxyReq);
      // Add CORS headers to response
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return new Response(
      JSON.stringify({ error: `Function '${functionName}' could not be loaded` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error(`[main-router] Error executing '${functionName}':`, error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        function: functionName,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
};

console.log(`[main-router] Ready. ${Object.keys(FUNCTION_HANDLERS).length} functions registered.`);

export default handler;
Deno.serve(handler);
