import { supabase } from "@/integrations/supabase/client";

/**
 * Safe upsert for system_settings table.
 * Resilient to duplicate keys, missing UNIQUE constraints,
 * and race conditions on self-hosted VPS databases.
 *
 * Strategy:
 * 1. Query ALL rows with the given key
 * 2. If duplicates exist, delete extras keeping the most recent
 * 3. UPDATE the surviving row, or INSERT if none exists
 * 4. Fallback: if UPDATE fails, try DELETE all + INSERT fresh
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
  console.log(`[safeSettingUpsert] Starting for key="${key}"`);

  // Step 1: Fetch ALL rows with this key (handles duplicates gracefully)
  const { data: allRows, error: selectError } = await supabase
    .from("system_settings")
    .select("id, updated_at")
    .eq("key", key)
    .order("updated_at", { ascending: false });

  if (selectError) {
    console.error(`[safeSettingUpsert] SELECT error for key="${key}":`, selectError);
    throw selectError;
  }

  const rowCount = allRows?.length ?? 0;
  console.log(`[safeSettingUpsert] Found ${rowCount} row(s) for key="${key}"`);

  // Step 2: If duplicates exist, clean them up (keep the most recent one)
  if (allRows && allRows.length > 1) {
    const idsToDelete = allRows.slice(1).map((r) => r.id);
    console.warn(
      `[safeSettingUpsert] Cleaning ${idsToDelete.length} duplicate(s) for key="${key}"`
    );
    const { error: deleteError } = await supabase
      .from("system_settings")
      .delete()
      .in("id", idsToDelete);

    if (deleteError) {
      console.error(`[safeSettingUpsert] Failed to clean duplicates:`, deleteError);
      // Non-fatal: continue with the update attempt
    }
  }

  const existing = allRows && allRows.length > 0 ? allRows[0] : null;

  // Step 3: UPDATE existing row or INSERT new one
  if (existing) {
    console.log(`[safeSettingUpsert] Updating existing row id=${existing.id} for key="${key}"`);
    const { error: updateError } = await supabase
      .from("system_settings")
      .update({ value, description, category })
      .eq("id", existing.id);

    if (updateError) {
      console.error(`[safeSettingUpsert] UPDATE failed, trying fallback:`, updateError);
      // Fallback: delete all rows with this key and insert fresh
      return await fallbackDeleteAndInsert({ key, value, description, category });
    }

    console.log(`[safeSettingUpsert] Successfully updated key="${key}"`);
  } else {
    console.log(`[safeSettingUpsert] Inserting new row for key="${key}"`);
    const { error: insertError } = await supabase
      .from("system_settings")
      .insert({ key, value, description, category });

    if (insertError) {
      console.error(`[safeSettingUpsert] INSERT failed, trying fallback:`, insertError);
      // Fallback: maybe a row was created between our SELECT and INSERT (race condition)
      // Try an UPDATE by key instead
      const { error: retryUpdateError } = await supabase
        .from("system_settings")
        .update({ value, description, category })
        .eq("key", key);

      if (retryUpdateError) {
        console.error(`[safeSettingUpsert] Retry UPDATE also failed:`, retryUpdateError);
        throw retryUpdateError;
      }
      console.log(`[safeSettingUpsert] Retry UPDATE succeeded for key="${key}"`);
    } else {
      console.log(`[safeSettingUpsert] Successfully inserted key="${key}"`);
    }
  }
}

/**
 * Fallback: delete all rows with the key, then insert a fresh one.
 */
async function fallbackDeleteAndInsert({
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
  console.warn(`[safeSettingUpsert] Fallback: DELETE + INSERT for key="${key}"`);

  const { error: deleteError } = await supabase
    .from("system_settings")
    .delete()
    .eq("key", key);

  if (deleteError) {
    console.error(`[safeSettingUpsert] Fallback DELETE failed:`, deleteError);
    throw deleteError;
  }

  const { error: insertError } = await supabase
    .from("system_settings")
    .insert({ key, value, description, category });

  if (insertError) {
    console.error(`[safeSettingUpsert] Fallback INSERT failed:`, insertError);
    throw insertError;
  }

  console.log(`[safeSettingUpsert] Fallback succeeded for key="${key}"`);
}
