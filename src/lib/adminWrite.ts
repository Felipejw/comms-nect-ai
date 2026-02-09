import { supabase } from "@/integrations/supabase/client";

/**
 * Generic admin write helper that:
 * 1. Tries Edge Function (admin-write) first — bypasses RLS using service_role
 * 2. Falls back to direct Supabase client call if Edge Function fails
 *
 * This ensures writes work on both VPS (where RLS may block) and Cloud.
 */

interface AdminWriteParams {
  table: string;
  operation: "insert" | "update" | "delete" | "upsert";
  data?: Record<string, any> | Record<string, any>[];
  filters?: Record<string, any>;
  onConflict?: string;
}

export async function adminWrite<T = any>({
  table,
  operation,
  data,
  filters,
  onConflict,
}: AdminWriteParams): Promise<T[] | null> {
  console.log(`[adminWrite] ${operation} on ${table}`);

  // 1. Try Edge Function first
  try {
    const { data: result, error } = await supabase.functions.invoke("admin-write", {
      body: { table, operation, data, filters, onConflict },
    });

    if (!error && result && !result.error) {
      console.log(`[adminWrite] Edge Function success for ${operation} on ${table}`);
      return result.data as T[];
    }

    // Edge function returned an error in the response body
    if (result?.error) {
      console.warn(`[adminWrite] Edge Function returned error: ${result.error}`);
    }
    if (error) {
      console.warn(`[adminWrite] Edge Function invoke error: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[adminWrite] Edge Function unavailable, trying direct:`, e);
  }

  // 2. Fallback: direct Supabase client call (works when RLS is properly configured)
  console.log(`[adminWrite] Fallback to direct Supabase client for ${operation} on ${table}`);

  try {
    if (operation === "insert") {
      const { data: insertData, error: insertError } = await supabase
        .from(table as any)
        .insert(data as any)
        .select();

      if (insertError) throw insertError;
      return insertData as T[];
    }

    if (operation === "update") {
      if (!filters || Object.keys(filters).length === 0) {
        throw new Error("Filters required for update");
      }

      let query = supabase.from(table as any).update(data as any);
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      const { data: updateData, error: updateError } = await query.select();

      if (updateError) throw updateError;
      return updateData as T[];
    }

    if (operation === "delete") {
      if (!filters || Object.keys(filters).length === 0) {
        throw new Error("Filters required for delete");
      }

      let query = supabase.from(table as any).delete();
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      const { data: deleteData, error: deleteError } = await query.select();

      if (deleteError) throw deleteError;
      return deleteData as T[];
    }

    if (operation === "upsert") {
      const opts = onConflict ? { onConflict } : undefined;
      const { data: upsertData, error: upsertError } = await supabase
        .from(table as any)
        .upsert(data as any, opts as any)
        .select();

      if (upsertError) throw upsertError;
      return upsertData as T[];
    }

    throw new Error(`Unsupported operation: ${operation}`);
  } catch (fallbackError: any) {
    console.error(`[adminWrite] Fallback also failed:`, fallbackError.message);
    throw fallbackError;
  }
}
