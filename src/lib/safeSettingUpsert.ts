import { supabase } from "@/integrations/supabase/client";

/**
 * Safe upsert for system_settings table.
 * Uses SELECT + INSERT/UPDATE instead of .upsert() to avoid
 * dependency on UNIQUE constraint (which may not exist on older DBs).
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
  const { data: existing, error: selectError } = await supabase
    .from("system_settings")
    .select("id")
    .eq("key", key)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from("system_settings")
      .update({ value, description, category })
      .eq("key", key);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("system_settings")
      .insert({ key, value, description, category });
    if (error) throw error;
  }
}
