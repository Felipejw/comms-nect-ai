import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

interface ApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: string[];
  is_active: boolean;
  expires_at: string | null;
}

async function validateApiKey(apiKey: string): Promise<{ valid: boolean; keyRow?: ApiKeyRow; error?: string }> {
  if (!apiKey || !apiKey.startsWith("tf_")) {
    return { valid: false, error: "Invalid API key format" };
  }

  const prefix = apiKey.substring(0, 7);
  const supabase = getSupabaseAdmin();

  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, name, key_hash, key_prefix, permissions, is_active, expires_at")
    .eq("key_prefix", prefix)
    .eq("is_active", true);

  if (error || !keys || keys.length === 0) {
    return { valid: false, error: "API key not found" };
  }

  const hash = await sha256(apiKey);

  const matchedKey = keys.find((k: any) => k.key_hash === hash);
  if (!matchedKey) {
    return { valid: false, error: "Invalid API key" };
  }

  if (matchedKey.expires_at && new Date(matchedKey.expires_at) < new Date()) {
    return { valid: false, error: "API key expired" };
  }

  // Update last_used_at
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", matchedKey.id);

  return { valid: true, keyRow: matchedKey as ApiKeyRow };
}

function hasPermission(keyRow: ApiKeyRow, required: string): boolean {
  const perms = keyRow.permissions || [];
  return perms.includes(required);
}

// ============ Route Handlers ============

async function handleHealth() {
  return json({ status: "ok", version: "1.1.0", timestamp: new Date().toISOString() });
}

async function handleGetContacts(url: URL) {
  const supabase = getSupabaseAdmin();
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const search = url.searchParams.get("search") || "";

  let query = supabase.from("contacts").select("id, name, phone, email, company, avatar_url, status, kanban_stage, whatsapp_lid, created_at, updated_at", { count: "exact" });

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1).order("created_at", { ascending: false });

  if (error) return json({ error: error.message }, 500);
  return json({ data, total: count, limit, offset });
}

async function handleGetContactById(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("contacts").select("*").eq("id", id).single();
  if (error) return json({ error: "Contact not found" }, 404);
  return json({ data });
}

async function handleCreateContact(body: any) {
  const supabase = getSupabaseAdmin();
  const { name, phone, email, company, notes } = body;
  if (!name) return json({ error: "Field 'name' is required" }, 400);

  const { data, error } = await supabase.from("contacts").insert({ name, phone, email, company, notes }).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ data }, 201);
}

async function handleUpdateContact(id: string, body: any) {
  const supabase = getSupabaseAdmin();
  const allowedFields = ["name", "phone", "email", "company", "notes", "status", "kanban_stage", "avatar_url"];
  const updates: Record<string, any> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: "No valid fields to update" }, 400);
  }

  const { data, error } = await supabase.from("contacts").update(updates).eq("id", id).select().single();
  if (error) return json({ error: error.message }, error.code === "PGRST116" ? 404 : 500);
  return json({ data });
}

async function handleDeleteContact(id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true, message: "Contact deleted" });
}

async function handleGetConversations(url: URL) {
  const supabase = getSupabaseAdmin();
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const status = url.searchParams.get("status");

  let query = supabase.from("conversations").select("id, contact_id, assigned_to, queue_id, status, channel, subject, unread_count, last_message_at, created_at, contacts(name, phone)", { count: "exact" });

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query.range(offset, offset + limit - 1).order("last_message_at", { ascending: false });

  if (error) return json({ error: error.message }, 500);
  return json({ data, total: count, limit, offset });
}

async function handleUpdateConversation(id: string, body: any) {
  const supabase = getSupabaseAdmin();
  const allowedFields = ["status", "assigned_to", "queue_id", "subject", "priority", "is_bot_active"];
  const updates: Record<string, any> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: "No valid fields to update" }, 400);
  }

  const { data, error } = await supabase.from("conversations").update(updates).eq("id", id).select().single();
  if (error) return json({ error: error.message }, error.code === "PGRST116" ? 404 : 500);
  return json({ data });
}

async function handleGetConversationMessages(conversationId: string, url: URL) {
  const supabase = getSupabaseAdmin();
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const { data, error, count } = await supabase
    .from("messages")
    .select("id, content, message_type, sender_type, sender_id, media_url, is_read, created_at", { count: "exact" })
    .eq("conversation_id", conversationId)
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json({ data, total: count, limit, offset });
}

async function handleGetConnections() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("connections").select("id, name, type, status, phone_number, is_default, created_at");
  if (error) return json({ error: error.message }, 500);
  return json({ data });
}

async function handleSendMessage(body: any) {
  const { phone, message, mediaUrl, mediaType, connectionId } = body;
  if (!phone || !message) return json({ error: "Fields 'phone' and 'message' are required" }, 400);

  // Call the existing send-whatsapp edge function
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const resp = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      phone,
      message,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      connectionId: connectionId || null,
    }),
  });

  const result = await resp.json();
  if (!resp.ok) return json({ error: result.error || "Failed to send message" }, resp.status);
  return json({ success: true, data: result });
}

async function handleGetStats() {
  const supabase = getSupabaseAdmin();
  
  const [contacts, conversations, connections, messages] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("conversations").select("*", { count: "exact", head: true }),
    supabase.from("connections").select("*", { count: "exact", head: true }),
    supabase.from("messages").select("*", { count: "exact", head: true }),
  ]);

  return json({
    contacts: contacts.count || 0,
    conversations: conversations.count || 0,
    connections: connections.count || 0,
    messages: messages.count || 0,
  });
}

// ============ Main Router ============

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let path = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  // Strip function name prefix if present (Cloud routing)
  path = path.replace(/^api-gateway\/?/, "");
  const parts = path.split("/").filter(Boolean);

  // Health check (no auth required)
  if (parts[0] === "health" || parts.length === 0) {
    return handleHealth();
  }

  // Validate API key
  const apiKey = req.headers.get("x-api-key") || req.headers.get("X-API-Key") || "";
  const validation = await validateApiKey(apiKey);

  if (!validation.valid) {
    return json({ error: validation.error, code: "UNAUTHORIZED" }, 401);
  }

  const keyRow = validation.keyRow!;
  const method = req.method;
  const route = parts.join("/");

  try {
    // GET /contacts
    if (method === "GET" && route === "contacts") {
      if (!hasPermission(keyRow, "read")) return json({ error: "Permission 'read' required" }, 403);
      return handleGetContacts(url);
    }

    // GET /contacts/:id
    if (method === "GET" && parts[0] === "contacts" && parts.length === 2) {
      if (!hasPermission(keyRow, "read")) return json({ error: "Permission 'read' required" }, 403);
      return handleGetContactById(parts[1]);
    }

    // POST /contacts
    if (method === "POST" && route === "contacts") {
      if (!hasPermission(keyRow, "write")) return json({ error: "Permission 'write' required" }, 403);
      const body = await req.json();
      return handleCreateContact(body);
    }

    // PUT /contacts/:id
    if (method === "PUT" && parts[0] === "contacts" && parts.length === 2) {
      if (!hasPermission(keyRow, "write")) return json({ error: "Permission 'write' required" }, 403);
      const body = await req.json();
      return handleUpdateContact(parts[1], body);
    }

    // DELETE /contacts/:id
    if (method === "DELETE" && parts[0] === "contacts" && parts.length === 2) {
      if (!hasPermission(keyRow, "write")) return json({ error: "Permission 'write' required" }, 403);
      return handleDeleteContact(parts[1]);
    }

    // GET /conversations
    if (method === "GET" && route === "conversations") {
      if (!hasPermission(keyRow, "read")) return json({ error: "Permission 'read' required" }, 403);
      return handleGetConversations(url);
    }

    // PUT /conversations/:id
    if (method === "PUT" && parts[0] === "conversations" && parts.length === 2) {
      if (!hasPermission(keyRow, "write")) return json({ error: "Permission 'write' required" }, 403);
      const body = await req.json();
      return handleUpdateConversation(parts[1], body);
    }

    // GET /conversations/:id/messages
    if (method === "GET" && parts[0] === "conversations" && parts[2] === "messages" && parts.length === 3) {
      if (!hasPermission(keyRow, "read")) return json({ error: "Permission 'read' required" }, 403);
      return handleGetConversationMessages(parts[1], url);
    }

    // GET /connections
    if (method === "GET" && route === "connections") {
      if (!hasPermission(keyRow, "read")) return json({ error: "Permission 'read' required" }, 403);
      return handleGetConnections();
    }

    // POST /messages/send
    if (method === "POST" && route === "messages/send") {
      if (!hasPermission(keyRow, "send")) return json({ error: "Permission 'send' required" }, 403);
      const body = await req.json();
      return handleSendMessage(body);
    }

    // GET /stats
    if (method === "GET" && route === "stats") {
      if (!hasPermission(keyRow, "read")) return json({ error: "Permission 'read' required" }, 403);
      return handleGetStats();
    }

    return json({ error: "Route not found", path: route }, 404);
  } catch (err) {
    console.error("[api-gateway] Error:", err);
    return json({ error: "Internal server error", message: err instanceof Error ? err.message : "Unknown" }, 500);
  }
};

export default handler;
if (import.meta.main) Deno.serve(handler);
