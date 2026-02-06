import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CampaignResult {
  campaign_id: string;
  campaign_name: string;
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  completed: boolean;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function substituteVariables(message: string, contact: { name?: string; phone?: string }): string {
  let result = message;
  result = result.replace(/\{\{nome\}\}/gi, contact.name || 'Cliente');
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone || '');
  return result;
}

function getNextRetryTime(retryCount: number): Date {
  const delayMinutes = Math.pow(3, retryCount) * 5;
  const nextRetry = new Date();
  nextRetry.setMinutes(nextRetry.getMinutes() + delayMinutes);
  return nextRetry;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting campaign execution...");

    // ... keep existing code (campaign execution logic)
  } catch (error) {
    console.error("Error in execute-campaign:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

export default handler;
Deno.serve(handler);
