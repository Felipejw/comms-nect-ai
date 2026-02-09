import { supabase } from "@/integrations/supabase/client";

/**
 * Safe upsert for system_settings table.
 * 1. Tries dedicated Edge Function (save-system-setting)
 * 2. Falls back to generic admin-write Edge Function
 * 3. Falls back to direct Supabase client call
 * 4. Verifies the save by reading back the value
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

  let saved = false;

  // 1. Try dedicated save-system-setting Edge Function
  try {
    const { data, error } = await supabase.functions.invoke("save-system-setting", {
      body: { key, value, description, category },
    });

    if (!error && data && !data.error) {
      console.log(`[safeSettingUpsert] Success via save-system-setting for key="${key}"`);
      saved = true;
    } else {
      if (data?.error) console.warn(`[safeSettingUpsert] save-system-setting returned:`, data.error);
      if (error) console.warn(`[safeSettingUpsert] save-system-setting invoke error:`, error.message);
    }
  } catch (e) {
    console.warn(`[safeSettingUpsert] save-system-setting unavailable:`, e);
  }

  // 2. Try generic admin-write Edge Function
  if (!saved) {
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
        saved = true;
      } else {
        if (data?.error) console.warn(`[safeSettingUpsert] admin-write returned:`, data.error);
        if (error) console.warn(`[safeSettingUpsert] admin-write invoke error:`, error.message);
      }
    } catch (e) {
      console.warn(`[safeSettingUpsert] admin-write unavailable:`, e);
    }
  }

  // 3. Fallback: direct Supabase client
  if (!saved) {
    console.log(`[safeSettingUpsert] Fallback to direct client for key="${key}"`);

    const { error: upsertError } = await supabase
      .from("system_settings")
      .upsert(
        { key, value, description, category },
        { onConflict: "key" }
      );

    if (upsertError) {
      console.error(`[safeSettingUpsert] Direct upsert failed for key="${key}":`, upsertError.message);
      // Don't throw yet - we'll verify below
    } else {
      console.log(`[safeSettingUpsert] Direct upsert reported success for key="${key}"`);
      saved = true;
    }
  }

  // 4. VERIFICATION: Read back the value to confirm it was actually saved
  try {
    const { data: verifyData, error: verifyError } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", key)
      .limit(1)
      .maybeSingle();

    if (verifyError) {
      console.warn(`[safeSettingUpsert] Verification read failed:`, verifyError.message);
      // If we thought we saved but can't verify, trust the save result
      if (!saved) {
        throw new Error(`Falha ao salvar configuração "${key}". Verifique as permissões do banco de dados.`);
      }
      return;
    }

    if (!verifyData) {
      console.error(`[safeSettingUpsert] VERIFICATION FAILED: key="${key}" not found in database after save`);
      throw new Error(`Configuração "${key}" não foi salva. O salvamento falhou silenciosamente. Atualize manualmente via banco de dados.`);
    }

    if (verifyData.value !== value) {
      console.error(`[safeSettingUpsert] VERIFICATION FAILED: key="${key}" has value="${verifyData.value}" but expected="${value}"`);
      throw new Error(`Configuração "${key}" não foi atualizada. Valor no banco: "${verifyData.value.substring(0, 8)}...". Atualize manualmente via banco de dados.`);
    }

    console.log(`[safeSettingUpsert] VERIFIED: key="${key}" saved correctly`);
  } catch (verifyErr: any) {
    // Re-throw verification errors
    if (verifyErr.message?.includes("não foi")) {
      throw verifyErr;
    }
    console.warn(`[safeSettingUpsert] Verification exception:`, verifyErr);
    if (!saved) {
      throw new Error(`Falha ao salvar configuração "${key}".`);
    }
  }
}
