import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the tenant_id for the currently authenticated user.
 * Used in mutation functions to inject tenant_id into INSERT operations.
 */
export async function getUserTenantId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  return profile?.tenant_id || null;
}
