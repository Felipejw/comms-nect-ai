import { supabase } from "@/integrations/supabase/client";

/**
 * Safe upsert for system_settings table.
 * 1. Tries dedicated Edge Function (save-system-setting)
 * 2. Falls back to generic admin-write Edge Function
 * 3. Falls back to direct Supabase client call
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
  console.log(`[safeSettingUpsert] Saving key="${key}"`);

  // 1. Try dedicated save-system-setting Edge Function
  try {
    const { data, error } = await supabase.functions.invoke("save-system-setting", {
      body: { key, value, description, category },
    });

    if (!error && data && !data.error) {
      console.log(`[safeSettingUpsert] Success via save-system-setting for key="${key}"`);
      return;
    }

    if (data?.error) {
      console.warn(`[safeSettingUpsert] save-system-setting returned:`, data.error);
    }
    if (error) {
      console.warn(`[safeSettingUpsert] save-system-setting invoke error:`, error.message);
    }
  } catch (e) {
    console.warn(`[safeSettingUpsert] save-system-setting unavailable:`, e);
  }

  // 2. Try generic admin-write Edge Function
  try {
    const { data, error } = await supabase.functions.invoke("admin-write", {
      body: {
        table: "system_settings",
        operation: "upsert",
        data: { key, value, description, category },
        onConflict: "key",
      },
    });

    if (!error && data && !data.error) {
      console.log(`[safeSettingUpsert] Success via admin-write for key="${key}"`);
      return;
    }

    if (data?.error) {
      console.warn(`[safeSettingUpsert] admin-write returned:`, data.error);
    }
    if (error) {
      console.warn(`[safeSettingUpsert] admin-write invoke error:`, error.message);
    }
  } catch (e) {
    console.warn(`[safeSettingUpsert] admin-write unavailable:`, e);
  }

  // 3. Fallback: direct Supabase client
  console.log(`[safeSettingUpsert] Fallback to direct client for key="${key}"`);

  const { error: upsertError } = await supabase
    .from("system_settings")
    .upsert(
      { key, value, description, category },
      { onConflict: "key" }
    );

  if (upsertError) {
    console.error(`[safeSettingUpsert] All methods failed for key="${key}":`, upsertError.message);
    throw new Error(upsertError.message);
  }

  console.log(`[safeSettingUpsert] Success via direct client for key="${key}"`);
}
