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
  awaitingMenuResponse: boolean;
  menuOptions?: Array<{ id: string; text: string }>;
  flowId: string;
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
      // For menu nodes, match by label (option id)
      return e.source_id === currentNodeId && e.label === optionId;
    }
    return e.source_id === currentNodeId;
  });

  if (!edge) return null;
  return nodes.find(n => n.id === edge.target_id) || null;
}

// Find the trigger node that matches the message
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
        const whatsappConnectionId = sourceNode.data.connectionId as string;
        if (connectionId && whatsappConnectionId && whatsappConnectionId !== connectionId) {
          console.log(`[FlowExecutor] Trigger ${trigger.id} skipped - WhatsApp connection mismatch`);
          continue;
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

// Match user input to menu option
function matchMenuOption(
  userInput: string, 
  menuOptions: Array<{ id: string; text: string }>
): { id: string; text: string } | null {
  const inputLower = userInput.toLowerCase().trim();
  
  // Try to match by number (1, 2, 3, etc.)
  const numericInput = parseInt(inputLower, 10);
  if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= menuOptions.length) {
    return menuOptions[numericInput - 1];
  }
  
  // Try to match by exact text
  for (const option of menuOptions) {
    if (option.text.toLowerCase() === inputLower) {
      return option;
    }
  }
  
  // Try to match by partial text (contains)
  for (const option of menuOptions) {
    if (option.text.toLowerCase().includes(inputLower) || inputLower.includes(option.text.toLowerCase())) {
      return option;
    }
  }
  
  return null;
}

// Execute flow from a specific node
async function executeFlowFromNode(
  supabase: any,
  nodes: FlowNode[],
  edges: FlowEdge[],
  startNode: FlowNode | null,
  conversationId: string,
  phone: string,
  messageContent: string,
  evolutionUrl: string,
  evolutionKey: string,
  instanceName: string,
  contactName: string,
  flowId: string
): Promise<void> {
  let currentNode = startNode;
  let iterationCount = 0;
  const maxIterations = 50; // Safety limit

  while (currentNode && iterationCount < maxIterations) {
    iterationCount++;
    console.log("[FlowExecutor] Executing node:", currentNode.type, currentNode.id);

    switch (currentNode.type) {
      case "message": {
        const content = currentNode.data.content as string || "";
        const messageType = currentNode.data.messageType as string || "text";
        const mediaUrl = currentNode.data.mediaUrl as string;
        
        // Replace variables in content
        const processedContent = content
          .replace(/\{\{nome\}\}/gi, contactName || "")
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
        
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: menuText,
          sender_type: "bot",
          message_type: "text",
        });

        // Save flow state to wait for menu response
        const flowState: FlowState = {
          currentNodeId: currentNode.id,
          awaitingMenuResponse: true,
          menuOptions: options,
          flowId: flowId,
        };

        await supabase
          .from("conversations")
          .update({ flow_state: flowState })
          .eq("id", conversationId);

        console.log("[FlowExecutor] Menu displayed, waiting for user response");
        currentNode = null; // Stop execution, wait for user input
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

        const updateData: Record<string, unknown> = {
          is_bot_active: false,
          active_flow_id: null,
          flow_state: null,
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
        currentNode = null;
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
            flow_state: null,
            status: markAsResolved ? "resolved" : "in_progress",
          })
          .eq("id", conversationId);

        console.log("[FlowExecutor] Flow ended, markAsResolved:", markAsResolved);
        currentNode = null;
        break;
      }

      case "whatsapp": {
        currentNode = getNextNode(nodes, edges, currentNode.id);
        break;
      }

      default:
        console.log("[FlowExecutor] Unknown node type:", currentNode.type);
        currentNode = getNextNode(nodes, edges, currentNode.id);
    }
  }

  if (iterationCount >= maxIterations) {
    console.error("[FlowExecutor] Max iterations reached, stopping execution");
  }
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
    const phone = contactPhone || conversation.contacts?.phone;
    const contactName = conversation.contacts?.name || "";

    // Check if we're waiting for a menu response
    const flowState = conversation.flow_state as FlowState | null;
    
    if (flowState?.awaitingMenuResponse && flowState.menuOptions && flowState.currentNodeId) {
      console.log("[FlowExecutor] Processing menu response for node:", flowState.currentNodeId);
      
      const selectedOption = matchMenuOption(messageContent, flowState.menuOptions);
      
      if (selectedOption) {
        console.log("[FlowExecutor] User selected option:", selectedOption.id, selectedOption.text);
        
        // Get flow nodes and edges
        const { data: flowNodes } = await supabase
          .from("flow_nodes")
          .select("*")
          .eq("flow_id", flowState.flowId);

        const { data: flowEdges } = await supabase
          .from("flow_edges")
          .select("*")
          .eq("flow_id", flowState.flowId);

        if (flowNodes && flowEdges) {
          const nodes: FlowNode[] = flowNodes.map(n => ({
            id: n.id,
            type: n.type,
            data: (n.data as Record<string, unknown>) || {},
          }));

          const edges: FlowEdge[] = flowEdges.map(e => ({
            id: e.id,
            source_id: e.source_id,
            target_id: e.target_id,
            label: e.label || undefined,
          }));

          // Clear flow state before continuing
          await supabase
            .from("conversations")
            .update({ flow_state: null })
            .eq("id", conversationId);

          // Find the next node based on selected option
          const nextNode = getNextNode(nodes, edges, flowState.currentNodeId, selectedOption.id);
          
          if (nextNode) {
            console.log("[FlowExecutor] Continuing flow from node:", nextNode.id);
            await executeFlowFromNode(
              supabase,
              nodes,
              edges,
              nextNode,
              conversationId,
              phone,
              messageContent,
              evolutionUrl,
              evolutionKey,
              instanceName,
              contactName,
              flowState.flowId
            );
          } else {
            console.log("[FlowExecutor] No next node found for selected option");
          }
        }
        
        return new Response(JSON.stringify({ success: true, message: "Menu response processed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Invalid option selected, ask again
        console.log("[FlowExecutor] Invalid menu option selected");
        
        let menuText = "Opção inválida. Por favor, escolha uma das opções:\n\n";
        flowState.menuOptions.forEach((opt, idx) => {
          menuText += `${idx + 1}. ${opt.text}\n`;
        });

        await sendWhatsAppMessage(evolutionUrl, evolutionKey, instanceName, phone, menuText);
        
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: menuText,
          sender_type: "bot",
          message_type: "text",
        });

        return new Response(JSON.stringify({ success: true, message: "Invalid option, asked again" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // Try to find a matching trigger
    let activeFlowId: string | null = null;
    let triggerNode: FlowNode | null = null;
    let flowNodes: FlowNode[] = [];
    let flowEdges: FlowEdge[] = [];

    const isNewConversation = conversation.status === "new";
    
    for (const flow of flows) {
      const { data: nodeData } = await supabase
        .from("flow_nodes")
        .select("*")
        .eq("flow_id", flow.id);

      if (!nodeData) continue;

      const nodes: FlowNode[] = nodeData.map(n => ({
        id: n.id,
        type: n.type,
        data: (n.data as Record<string, unknown>) || {},
      }));

      const { data: edgeData } = await supabase
        .from("flow_edges")
        .select("*")
        .eq("flow_id", flow.id);

      const edges: FlowEdge[] = (edgeData || []).map(e => ({
        id: e.id,
        source_id: e.source_id,
        target_id: e.target_id,
        label: e.label || undefined,
      }));

      const matchingTrigger = findMatchingTrigger(nodes, edges, messageContent, isNewConversation, connectionId);
      
      if (matchingTrigger) {
        activeFlowId = flow.id;
        triggerNode = matchingTrigger;
        flowNodes = nodes;
        flowEdges = edges;
        
        // Update conversation with active flow
        await supabase
          .from("conversations")
          .update({ active_flow_id: flow.id, is_bot_active: true })
          .eq("id", conversationId);

        console.log("[FlowExecutor] Found matching trigger in flow:", flow.id);
        break;
      }
    }

    if (!activeFlowId || !triggerNode) {
      console.log("[FlowExecutor] No matching trigger found");
      return new Response(JSON.stringify({ success: true, message: "No matching trigger" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Execute flow starting from the trigger
    const startNode = getNextNode(flowNodes, flowEdges, triggerNode.id);
    
    await executeFlowFromNode(
      supabase,
      flowNodes,
      flowEdges,
      startNode,
      conversationId,
      phone,
      messageContent,
      evolutionUrl,
      evolutionKey,
      instanceName,
      contactName,
      activeFlowId
    );

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
