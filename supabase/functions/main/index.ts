// ===========================================
// Main Function - Cloud Compatible
// Simple health/info endpoint for Supabase Cloud deployment
// VPS routing is handled by ../index.ts (not deployed to Cloud)
// ===========================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ status: 'ok', mode: 'cloud', version: '1.0.0' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
};

export default handler;
if (import.meta.main) Deno.serve(handler);
