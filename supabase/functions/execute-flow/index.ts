import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface FlowEdge {
  id: string;
  source_id: string;
  target_id: string;
  label?: string;
}

interface FlowState {
  currentNodeId: string;
  awaitingInput: boolean;
  menuOptions?: Array<{ id: string; text: string }>;
  delayUntil?: string;
}

// Send WhatsApp message through Evolution API
async function sendWhatsAppMessage(
  evolutionUrl: string,
  evolutionKey: string,
  instanceName: string,
  phone: string,
  content: string,
  mediaUrl?: string,
  mediaType?: string
): Promise<boolean> {
  try {
    let endpoint = `${evolutionUrl}/message/sendText/${instanceName}`;
    let body: Record<string, unknown> = {
      number: phone,
      text: content,
    };

    if (mediaUrl && mediaType) {
      if (mediaType === "image") {
        endpoint = `${evolutionUrl}/message/sendMedia/${instanceName}`;
        body = { number: phone, mediatype: "image", media: mediaUrl, caption: content };
      } else if (mediaType === "video") {
        endpoint = `${evolutionUrl}/message/sendMedia/${instanceName}`;
        body = { number: phone, mediatype: "video", media: mediaUrl, caption: content };
      } else if (mediaType === "document") {
        endpoint = `${evolutionUrl}/message/sendMedia/${instanceName}`;
        body = { number: phone, mediatype: "document", media: mediaUrl, fileName: "documento", caption: content };
      } else if (mediaType === "audio") {
        endpoint = `${evolutionUrl}/message/sendWhatsAppAudio/${instanceName}`;
        body = { number: phone, audio: mediaUrl };
      }
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error("[FlowExecutor] Failed to send message:", await response.text());
      return false;
    }

    console.log("[FlowExecutor] Message sent successfully");
    return true;
  } catch (error) {
    console.error("[FlowExecutor] Error sending message:", error);
    return false;
  }
}

// Call AI model via Lovable AI Gateway
async function callAI(
  systemPrompt: string,
  userMessage: string,
  model: string,
  temperature: number,
  maxTokens: number,
  knowledgeBase?: string
): Promise<string> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) {
    console.error("[FlowExecutor] LOVABLE_API_KEY not configured");
    return "Desculpe, não foi possível processar sua mensagem.";
  }

  const fullSystemPrompt = knowledgeBase 
    ? `${systemPrompt}\n\n### Base de conhecimento:\n${knowledgeBase}`
    : systemPrompt;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: fullSystemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 1024,
      }),
    });

    if (!response.ok) {
      console.error("[FlowExecutor] AI API error:", await response.text());
      return "Desculpe, ocorreu um erro ao processar sua mensagem.";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Não consegui gerar uma resposta.";
  } catch (error) {
    console.error("[FlowExecutor] Error calling AI:", error);
    return "Desculpe, ocorreu um erro ao processar sua mensagem.";
  }
}

// Get the next node following an edge
function getNextNode(nodes: FlowNode[], edges: FlowEdge[], currentNodeId: string, optionId?: string): FlowNode | null {
  const edge = edges.find(e => {
    if (optionId) {
      // For menu nodes, match by source handle (option id)
      return e.source_id === currentNodeId && e.label === optionId;
    }
    return e.source_id === currentNodeId;
  });

  if (!edge) return null;
  return nodes.find(n => n.id === edge.target_id) || null;
}

// Find the trigger node that matches the message
// Now also checks if the trigger has a connected WhatsApp block that matches the connectionId
function findMatchingTrigger(
  nodes: FlowNode[], 
  edges: FlowEdge[], 
  message: string, 
  isNewConversation: boolean,
  connectionId?: string
): FlowNode | null {
  const triggers = nodes.filter(n => n.type === "trigger");
  
  for (const trigger of triggers) {
    // Check if this trigger has a WhatsApp block connected to it (as input)
    const incomingEdge = edges.find(e => e.target_id === trigger.id);
    if (incomingEdge) {
      const sourceNode = nodes.find(n => n.id === incomingEdge.source_id);
      if (sourceNode && sourceNode.type === "whatsapp") {
        // If WhatsApp block is connected, check if connectionId matches
        const whatsappConnectionId = sourceNode.data.connectionId as string;
        if (connectionId && whatsappConnectionId && whatsappConnectionId !== connectionId) {
          console.log(`[FlowExecutor] Trigger ${trigger.id} skipped - WhatsApp connection mismatch (expected: ${whatsappConnectionId}, got: ${connectionId})`);
          continue; // Skip this trigger, it's for a different WhatsApp number
        }
        console.log(`[FlowExecutor] Trigger ${trigger.id} matched WhatsApp connection: ${connectionId}`);
      }
    }
    
    const triggerType = trigger.data.triggerType as string;
    const triggerValue = (trigger.data.triggerValue as string || "").toLowerCase();
    const messageLower = message.toLowerCase();

    if (triggerType === "new_conversation" && isNewConversation) {
      return trigger;
    }
    
    if (triggerType === "keyword") {
      const keywords = triggerValue.split(",").map(k => k.trim());
      if (keywords.some(k => messageLower.includes(k))) {
        return trigger;
      }
    }
    
    if (triggerType === "phrase" && messageLower.includes(triggerValue)) {
      return trigger;
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL") ?? "";
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { conversationId, messageContent, contactPhone, connectionId } = await req.json();

    console.log("[FlowExecutor] Processing message for conversation:", conversationId);
    console.log("[FlowExecutor] Message content:", messageContent);

    // Get conversation with flow state
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, contacts(*)")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("[FlowExecutor] Conversation not found:", convError);
      return new Response(JSON.stringify({ success: false, error: "Conversation not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if bot is active for this conversation
    if (conversation.is_bot_active === false) {
      console.log("[FlowExecutor] Bot is disabled for this conversation");
      return new Response(JSON.stringify({ success: true, message: "Bot disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get connection for this conversation
    const { data: connection } = await supabase
      .from("connections")
      .select("*")
      .eq("status", "connected")
      .limit(1)
      .single();

    if (!connection) {
      console.error("[FlowExecutor] No active WhatsApp connection found");
      return new Response(JSON.stringify({ success: false, error: "No active connection" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceName = (connection.session_data as Record<string, unknown>)?.instanceName as string || connection.name;

    // Get active flow or find a matching one
    let activeFlowId = conversation.active_flow_id;
    let flowState: FlowState | null = null;

    // Check for existing flow state in conversation
    if (activeFlowId) {
      // Flow already in progress - check stored state
      // For simplicity, we'll track flow state in a session-like manner
      console.log("[FlowExecutor] Active flow found:", activeFlowId);
    }

    // Get all active flows
    const { data: flows } = await supabase
      .from("chatbot_flows")
      .select("*")
      .eq("is_active", true);

    if (!flows || flows.length === 0) {
      console.log("[FlowExecutor] No active flows found");
      return new Response(JSON.stringify({ success: true, message: "No active flows" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no active flow, try to find a matching trigger
    if (!activeFlowId) {
      const isNewConversation = conversation.status === "new";
      
      for (const flow of flows) {
        const { data: flowNodes } = await supabase
          .from("flow_nodes")
          .select("*")
          .eq("flow_id", flow.id);

        if (!flowNodes) continue;

        const nodes: FlowNode[] = flowNodes.map(n => ({
          id: n.id,
          type: n.type,
          data: (n.data as Record<string, unknown>) || {},
        }));

        const { data: flowEdgesForSearch } = await supabase
          .from("flow_edges")
          .select("*")
          .eq("flow_id", flow.id);

        const edgesForSearch: FlowEdge[] = (flowEdgesForSearch || []).map(e => ({
          id: e.id,
          source_id: e.source_id,
          target_id: e.target_id,
          label: e.label || undefined,
        }));

        const matchingTrigger = findMatchingTrigger(nodes, edgesForSearch, messageContent, isNewConversation, connectionId);
        
        if (matchingTrigger) {
          activeFlowId = flow.id;
          
          // Update conversation with active flow
          await supabase
            .from("conversations")
            .update({ active_flow_id: flow.id, is_bot_active: true })
            .eq("id", conversationId);

          console.log("[FlowExecutor] Found matching trigger in flow:", flow.id);
          break;
        }
      }
    }

    if (!activeFlowId) {
      console.log("[FlowExecutor] No matching trigger found");
      return new Response(JSON.stringify({ success: true, message: "No matching trigger" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get flow nodes and edges
    const { data: flowNodes } = await supabase
      .from("flow_nodes")
      .select("*")
      .eq("flow_id", activeFlowId);

    const { data: flowEdges } = await supabase
      .from("flow_edges")
      .select("*")
      .eq("flow_id", activeFlowId);

    if (!flowNodes) {
      console.error("[FlowExecutor] No nodes found for flow");
      return new Response(JSON.stringify({ success: false, error: "No nodes in flow" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nodes: FlowNode[] = flowNodes.map(n => ({
      id: n.id,
      type: n.type,
      data: (n.data as Record<string, unknown>) || {},
    }));

    const edges: FlowEdge[] = (flowEdges || []).map(e => ({
      id: e.id,
      source_id: e.source_id,
      target_id: e.target_id,
      label: e.label || undefined,
    }));

    // Find the starting trigger node
    const triggerNode = findMatchingTrigger(nodes, edges, messageContent, conversation.status === "new", connectionId);
    
    if (!triggerNode) {
      console.log("[FlowExecutor] No matching trigger in active flow");
      return new Response(JSON.stringify({ success: true, message: "No matching trigger" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Execute flow starting from the trigger
    let currentNode: FlowNode | null = getNextNode(nodes, edges, triggerNode.id);
    const phone = contactPhone || conversation.contacts?.phone;

    while (currentNode) {
      console.log("[FlowExecutor] Executing node:", currentNode.type, currentNode.id);

      switch (currentNode.type) {
        case "message": {
          const content = currentNode.data.content as string || "";
          const messageType = currentNode.data.messageType as string || "text";
          const mediaUrl = currentNode.data.mediaUrl as string;
          
          // Replace variables in content
          const processedContent = content
            .replace(/\{\{nome\}\}/gi, conversation.contacts?.name || "")
            .replace(/\{\{telefone\}\}/gi, phone || "");

          await sendWhatsAppMessage(
            evolutionUrl,
            evolutionKey,
            instanceName,
            phone,
            processedContent,
            mediaUrl,
            messageType !== "text" ? messageType : undefined
          );

          // Save bot message to database
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: processedContent,
            sender_type: "bot",
            message_type: messageType,
            media_url: mediaUrl || null,
          });

          currentNode = getNextNode(nodes, edges, currentNode.id);
          break;
        }

        case "delay": {
          const delay = (currentNode.data.delay as number) || 1;
          const unit = (currentNode.data.unit as string) || "seconds";
          
          let delayMs = delay * 1000;
          if (unit === "minutes") delayMs = delay * 60 * 1000;
          if (unit === "hours") delayMs = delay * 60 * 60 * 1000;
          
          // Cap delay at 30 seconds for this execution
          delayMs = Math.min(delayMs, 30000);
          
          await new Promise(resolve => setTimeout(resolve, delayMs));
          currentNode = getNextNode(nodes, edges, currentNode.id);
          break;
        }

        case "menu": {
          const title = currentNode.data.title as string || "Escolha uma opção:";
          const options = (currentNode.data.options as Array<{ id: string; text: string }>) || [];
          
          let menuText = title + "\n\n";
          options.forEach((opt, idx) => {
            menuText += `${idx + 1}. ${opt.text}\n`;
          });

          await sendWhatsAppMessage(evolutionUrl, evolutionKey, instanceName, phone, menuText);
          
          // Save menu message
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: menuText,
            sender_type: "bot",
            message_type: "text",
          });

          // For menu, we stop execution and wait for user response
          // Store state to continue later (would need additional logic for resuming)
          currentNode = null;
          break;
        }

        case "ai": {
          const isEnabled = currentNode.data.isEnabled !== false;
          
          if (isEnabled) {
            const systemPrompt = currentNode.data.systemPrompt as string || "Você é um assistente útil.";
            const model = currentNode.data.model as string || "google/gemini-2.5-flash";
            const temperature = (currentNode.data.temperature as number) ?? 0.7;
            const maxTokens = (currentNode.data.maxTokens as number) || 1024;
            const knowledgeBase = currentNode.data.knowledgeBase as string;

            const aiResponse = await callAI(systemPrompt, messageContent, model, temperature, maxTokens, knowledgeBase);

            await sendWhatsAppMessage(evolutionUrl, evolutionKey, instanceName, phone, aiResponse);
            
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              content: aiResponse,
              sender_type: "bot",
              message_type: "text",
            });
          }

          currentNode = getNextNode(nodes, edges, currentNode.id);
          break;
        }

        case "crm": {
          const kanbanColumnId = currentNode.data.kanbanColumnId as string;
          
          if (kanbanColumnId) {
            await supabase
              .from("conversations")
              .update({ kanban_column_id: kanbanColumnId })
              .eq("id", conversationId);
            
            console.log("[FlowExecutor] Updated CRM stage to:", kanbanColumnId);
          }

          currentNode = getNextNode(nodes, edges, currentNode.id);
          break;
        }

        case "transfer": {
          const transferType = currentNode.data.transferType as string || "queue";
          const message = currentNode.data.message as string;
          
          if (message) {
            await sendWhatsAppMessage(evolutionUrl, evolutionKey, instanceName, phone, message);
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              content: message,
              sender_type: "bot",
              message_type: "text",
            });
          }

          // Update conversation based on transfer type
          const updateData: Record<string, unknown> = {
            is_bot_active: false,
            active_flow_id: null,
            status: "in_progress",
          };

          if (transferType === "queue" && currentNode.data.queueId) {
            updateData.queue_id = currentNode.data.queueId;
          }
          
          if (transferType === "agent" && currentNode.data.agentId) {
            updateData.assigned_to = currentNode.data.agentId;
          }

          await supabase
            .from("conversations")
            .update(updateData)
            .eq("id", conversationId);

          console.log("[FlowExecutor] Transferred conversation:", transferType);
          currentNode = null; // Stop execution after transfer
          break;
        }

        case "end": {
          const message = currentNode.data.message as string;
          const markAsResolved = currentNode.data.markAsResolved !== false;
          
          if (message) {
            await sendWhatsAppMessage(evolutionUrl, evolutionKey, instanceName, phone, message);
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              content: message,
              sender_type: "bot",
              message_type: "text",
            });
          }

          await supabase
            .from("conversations")
            .update({
              is_bot_active: false,
              active_flow_id: null,
              status: markAsResolved ? "resolved" : "in_progress",
            })
            .eq("id", conversationId);

          console.log("[FlowExecutor] Flow ended, markAsResolved:", markAsResolved);
          currentNode = null;
          break;
        }

        case "whatsapp": {
          // WhatsApp node is for routing - just continue to next
          currentNode = getNextNode(nodes, edges, currentNode.id);
          break;
        }

        default:
          console.log("[FlowExecutor] Unknown node type:", currentNode.type);
          currentNode = getNextNode(nodes, edges, currentNode.id);
      }

      // Safety limit to prevent infinite loops
      if (currentNode && nodes.indexOf(currentNode) === -1) {
        console.error("[FlowExecutor] Invalid node reference, stopping");
        break;
      }
    }

    console.log("[FlowExecutor] Flow execution completed");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[FlowExecutor] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
