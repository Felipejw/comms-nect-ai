import { supabase } from "@/integrations/supabase/client";

/**
 * Safe upsert for system_settings table.
 * Delegates to the backend Edge Function which uses service role key,
 * bypassing RLS policies entirely. Works on both Cloud and self-hosted VPS.
 */
export async function safeSettingUpsert({
  key,
  value,
  description,
  category,
}: {
  key: string;
  value: string;
  description?: string;
  category?: string;
}) {
  console.log(`[safeSettingUpsert] Calling backend for key="${key}"`);

  const { data, error } = await supabase.functions.invoke("save-system-setting", {
    body: { key, value, description, category },
  });

  if (error) {
    console.error(`[safeSettingUpsert] Edge function error for key="${key}":`, error);
    throw new Error(error.message || "Failed to save setting via backend");
  }

  if (data?.error) {
    console.error(`[safeSettingUpsert] Backend returned error for key="${key}":`, data.error);
    throw new Error(data.error);
  }

  console.log(`[safeSettingUpsert] Successfully saved key="${key}" via backend`);
}
