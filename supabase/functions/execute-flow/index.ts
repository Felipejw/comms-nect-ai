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
  menuTitle?: string;
  flowId: string;
  // AI conversation mode
  awaitingAIResponse?: boolean;
  aiNodeData?: {
    systemPrompt: string;
    model: string;
    temperature: number;
    maxTokens: number;
    knowledgeBase?: string;
    useOwnApiKey?: boolean;
    googleApiKey?: string;
  };
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

// Message history type
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Fetch conversation history for AI context
async function fetchConversationHistory(
  supabase: any,
  conversationId: string,
  maxMessages: number = 10
): Promise<ChatMessage[]> {
  try {
    const { data: messages, error } = await supabase
      .from("messages")
      .select("content, sender_type, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(maxMessages);

    if (error || !messages) {
      console.error("[FlowExecutor] Error fetching history:", error);
      return [];
    }

    // Convert to chat format and reverse to chronological order
    const history: ChatMessage[] = messages
      .reverse()
      .map((msg: any) => ({
        role: msg.sender_type === "contact" ? "user" : "assistant",
        content: msg.content,
      }));

    console.log(`[FlowExecutor] Loaded ${history.length} messages for context`);
    return history;
  } catch (error) {
    console.error("[FlowExecutor] Error in fetchConversationHistory:", error);
    return [];
  }
}

// Call Google AI Studio API directly (for user's own API key)
async function callGoogleAI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string,
  temperature: number,
  maxTokens: number,
  knowledgeBase?: string,
  conversationHistory?: ChatMessage[]
): Promise<string> {
  const fullSystemPrompt = knowledgeBase 
    ? `${systemPrompt}\n\n### Base de conhecimento:\n${knowledgeBase}`
    : systemPrompt;

  try {
    console.log("[FlowExecutor] Calling Google AI Studio with model:", model);
    
    // Build contents array with history
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      }
    }
    
    // Add current user message
    contents.push({ role: "user", parts: [{ text: userMessage }] });
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: fullSystemPrompt }] },
          generationConfig: {
            temperature: temperature || 0.7,
            maxOutputTokens: maxTokens || 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[FlowExecutor] Google AI error:", errorText);
      return "Desculpe, ocorreu um erro ao processar sua mensagem.";
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Não consegui gerar uma resposta.";
  } catch (error) {
    console.error("[FlowExecutor] Error calling Google AI:", error);
    return "Desculpe, ocorreu um erro ao processar sua mensagem.";
  }
}

// Call AI model via Lovable AI Gateway
async function callLovableAI(
  systemPrompt: string,
  userMessage: string,
  model: string,
  temperature: number,
  maxTokens: number,
  knowledgeBase?: string,
  conversationHistory?: ChatMessage[]
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
    console.log("[FlowExecutor] Calling Lovable AI with model:", model);
    
    // Build messages array with history
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: fullSystemPrompt },
    ];
    
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    
    // Add current user message
    messages.push({ role: "user", content: userMessage });
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        messages,
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

// Unified AI caller that routes to the appropriate API
async function callAI(
  systemPrompt: string,
  userMessage: string,
  model: string,
  temperature: number,
  maxTokens: number,
  knowledgeBase?: string,
  useOwnApiKey?: boolean,
  googleApiKey?: string,
  conversationHistory?: ChatMessage[]
): Promise<string> {
  if (useOwnApiKey && googleApiKey) {
    return callGoogleAI(googleApiKey, systemPrompt, userMessage, model, temperature, maxTokens, knowledgeBase, conversationHistory);
  }
  return callLovableAI(systemPrompt, userMessage, model, temperature, maxTokens, knowledgeBase, conversationHistory);
}

// Get the next node following an edge
function getNextNode(nodes: FlowNode[], edges: FlowEdge[], currentNodeId: string, optionId?: string): FlowNode | null {
  const edge = edges.find(e => {
    if (optionId) {
      // For menu and condition nodes, match by label (option id)
      return e.source_id === currentNodeId && e.label === optionId;
    }
    return e.source_id === currentNodeId;
  });

  if (!edge) return null;
  return nodes.find(n => n.id === edge.target_id) || null;
}

// Evaluate condition based on contact/conversation data
async function evaluateCondition(
  supabase: any,
  nodeData: Record<string, unknown>,
  conversationId: string,
  contactId: string,
  messageContent: string,
  contactName: string,
  contactPhone: string
): Promise<boolean> {
  const conditionType = nodeData.conditionType as string || "message";
  
  console.log("[FlowExecutor] Evaluating condition:", conditionType, nodeData);

  switch (conditionType) {
    case "tag": {
      const tagId = nodeData.tagId as string;
      if (!tagId) {
        console.log("[FlowExecutor] No tag ID configured for condition");
        return false;
      }
      
      // Check if contact has this tag
      const { data: contactTag, error } = await supabase
        .from("contact_tags")
        .select("id")
        .eq("contact_id", contactId)
        .eq("tag_id", tagId)
        .maybeSingle();
      
      if (error) {
        console.error("[FlowExecutor] Error checking tag:", error);
        return false;
      }
      
      const hasTag = !!contactTag;
      console.log("[FlowExecutor] Contact has tag:", hasTag);
      return hasTag;
    }
    
    case "kanban": {
      const kanbanColumnId = nodeData.kanbanColumnId as string;
      if (!kanbanColumnId) {
        console.log("[FlowExecutor] No kanban column ID configured for condition");
        return false;
      }
      
      // Check conversation's kanban column
      const { data: conversation, error } = await supabase
        .from("conversations")
        .select("kanban_column_id")
        .eq("id", conversationId)
        .single();
      
      if (error) {
        console.error("[FlowExecutor] Error checking kanban column:", error);
        return false;
      }
      
      const isInColumn = conversation?.kanban_column_id === kanbanColumnId;
      console.log("[FlowExecutor] Conversation in column:", isInColumn, conversation?.kanban_column_id, "vs", kanbanColumnId);
      return isInColumn;
    }

    case "business_hours": {
      const startTime = nodeData.startTime as string || "09:00";
      const endTime = nodeData.endTime as string || "18:00";
      
      // Get current time in Brazil timezone (most common for this system)
      const now = new Date();
      const brasilOffset = -3 * 60; // UTC-3
      const localTime = new Date(now.getTime() + (brasilOffset + now.getTimezoneOffset()) * 60000);
      
      const currentHours = localTime.getHours();
      const currentMinutes = localTime.getMinutes();
      const currentTimeMinutes = currentHours * 60 + currentMinutes;
      
      const [startHours, startMinutes] = startTime.split(":").map(Number);
      const [endHours, endMinutes] = endTime.split(":").map(Number);
      
      const startTimeMinutes = startHours * 60 + startMinutes;
      const endTimeMinutes = endHours * 60 + endMinutes;
      
      const isWithinHours = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
      console.log("[FlowExecutor] Business hours check:", isWithinHours, `Current: ${currentHours}:${currentMinutes}, Range: ${startTime}-${endTime}`);
      return isWithinHours;
    }

    case "day_of_week": {
      const daysOfWeek = nodeData.daysOfWeek as string[] || [];
      if (daysOfWeek.length === 0) {
        console.log("[FlowExecutor] No days configured for condition");
        return false;
      }
      
      // Get current day in Brazil timezone
      const now = new Date();
      const brasilOffset = -3 * 60; // UTC-3
      const localTime = new Date(now.getTime() + (brasilOffset + now.getTimezoneOffset()) * 60000);
      
      const currentDay = localTime.getDay().toString(); // 0 = Sunday, 6 = Saturday
      const isSelectedDay = daysOfWeek.includes(currentDay);
      console.log("[FlowExecutor] Day of week check:", isSelectedDay, `Current day: ${currentDay}, Selected: ${daysOfWeek.join(",")}`);
      return isSelectedDay;
    }

    case "message_count": {
      const messageCount = nodeData.messageCount as number || 0;
      const messageOperator = nodeData.messageOperator as string || "greater";
      
      // Count messages in the conversation
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);
      
      if (error) {
        console.error("[FlowExecutor] Error counting messages:", error);
        return false;
      }
      
      const actualCount = count || 0;
      let result = false;
      
      switch (messageOperator) {
        case "greater":
          result = actualCount > messageCount;
          break;
        case "less":
          result = actualCount < messageCount;
          break;
        case "equals":
          result = actualCount === messageCount;
          break;
        case "greater_equals":
          result = actualCount >= messageCount;
          break;
        case "less_equals":
          result = actualCount <= messageCount;
          break;
        default:
          result = actualCount > messageCount;
      }
      
      console.log("[FlowExecutor] Message count check:", result, `Actual: ${actualCount} ${messageOperator} ${messageCount}`);
      return result;
    }
    
    case "message":
    default: {
      const field = nodeData.field as string || "message";
      const operator = nodeData.operator as string || "contains";
      const value = (nodeData.value as string || "").toLowerCase();
      
      let fieldValue = "";
      switch (field) {
        case "message":
          fieldValue = messageContent.toLowerCase();
          break;
        case "contact_name":
          fieldValue = (contactName || "").toLowerCase();
          break;
        case "contact_phone":
          fieldValue = (contactPhone || "").toLowerCase();
          break;
        default:
          fieldValue = messageContent.toLowerCase();
      }
      
      let result = false;
      switch (operator) {
        case "contains":
          result = fieldValue.includes(value);
          break;
        case "equals":
          result = fieldValue === value;
          break;
        case "not_equals":
          result = fieldValue !== value;
          break;
        case "starts_with":
          result = fieldValue.startsWith(value);
          break;
        case "ends_with":
          result = fieldValue.endsWith(value);
          break;
        default:
          result = fieldValue.includes(value);
      }
      
      console.log("[FlowExecutor] Message condition result:", result, `"${fieldValue}" ${operator} "${value}"`);
      return result;
    }
  }
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
  contactId: string,
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
          menuTitle: title,
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
          const useOwnApiKey = currentNode.data.useOwnApiKey as boolean;
          const googleApiKey = currentNode.data.googleApiKey as string;

          // Fetch conversation history for context
          const conversationHistory = await fetchConversationHistory(supabase, conversationId, 10);

          const aiResponse = await callAI(
            systemPrompt, 
            messageContent, 
            model, 
            temperature, 
            maxTokens, 
            knowledgeBase,
            useOwnApiKey,
            googleApiKey,
            conversationHistory
          );

          await sendWhatsAppMessage(evolutionUrl, evolutionKey, instanceName, phone, aiResponse);
          
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: aiResponse,
            sender_type: "bot",
            message_type: "text",
          });

          // Check if there's a next node
          const nextNode = getNextNode(nodes, edges, currentNode.id);
          
          if (nextNode) {
            // Continue to next node
            currentNode = nextNode;
          } else {
            // No next node - enter continuous AI conversation mode
            console.log("[FlowExecutor] AI conversation mode activated");
            
            const aiState: FlowState = {
              currentNodeId: currentNode.id,
              awaitingMenuResponse: false,
              awaitingAIResponse: true,
              aiNodeData: {
                systemPrompt,
                model,
                temperature,
                maxTokens,
                knowledgeBase,
                useOwnApiKey,
                googleApiKey,
              },
              flowId: flowId,
            };
            
            await supabase
              .from("conversations")
              .update({ flow_state: aiState })
              .eq("id", conversationId);
            
            currentNode = null; // Stop execution, wait for next message
          }
        } else {
          currentNode = getNextNode(nodes, edges, currentNode.id);
        }
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

      case "condition": {
        // Evaluate the condition
        const conditionResult = await evaluateCondition(
          supabase,
          currentNode.data,
          conversationId,
          contactId,
          messageContent,
          contactName,
          phone
        );
        
        // Follow the appropriate path based on condition result
        const nextNodeId = conditionResult ? "yes" : "no";
        console.log("[FlowExecutor] Condition result:", conditionResult, "-> following", nextNodeId);
        
        currentNode = getNextNode(nodes, edges, currentNode.id, nextNodeId);
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

    // Get connection for this conversation - prioritize the one passed or linked
    let connection = null;

    // First, try the connection passed from webhook
    if (connectionId) {
      const { data: passedConnection } = await supabase
        .from("connections")
        .select("*")
        .eq("id", connectionId)
        .eq("status", "connected")
        .single();
      
      if (passedConnection) {
        connection = passedConnection;
        console.log("[FlowExecutor] Using connection from webhook:", connectionId);
      }
    }

    // If not found, try the connection linked to conversation
    if (!connection && conversation.connection_id) {
      const { data: linkedConnection } = await supabase
        .from("connections")
        .select("*")
        .eq("id", conversation.connection_id)
        .eq("status", "connected")
        .single();
      
      if (linkedConnection) {
        connection = linkedConnection;
        console.log("[FlowExecutor] Using connection from conversation:", conversation.connection_id);
      }
    }

    // Fallback to any connected instance
    if (!connection) {
      const { data: anyConnection } = await supabase
        .from("connections")
        .select("*")
        .eq("status", "connected")
        .limit(1)
        .single();
      
      connection = anyConnection;
      console.log("[FlowExecutor] Using fallback connection");
    }

    if (!connection) {
      console.error("[FlowExecutor] No active WhatsApp connection found");
      return new Response(JSON.stringify({ success: false, error: "No active connection" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceName = (connection.session_data as Record<string, unknown>)?.instanceName as string || connection.name;
    const contactId = conversation.contact_id;
    const contactName = conversation.contacts?.name || "";
    
    // Determine the correct phone/LID to use for sending messages
    // If contact has a whatsapp_lid, use that (with @lid suffix) for sending
    // Otherwise use the regular phone number
    const whatsappLid = conversation.contacts?.whatsapp_lid;
    let phone = contactPhone || conversation.contacts?.phone;
    
    // If we have a LID, we need to format it properly for the Evolution API
    // The API expects either a regular phone number OR the full remoteJid format
    if (whatsappLid && phone === whatsappLid) {
      // The phone stored is actually the LID, not a real number
      // Try using the LID format for Evolution API
      phone = `${whatsappLid}@lid`;
      console.log(`[FlowExecutor] Using LID format for sending: ${phone}`);
    }
    
    console.log(`[FlowExecutor] Contact: ${contactName}, Phone: ${phone}, LID: ${whatsappLid}`);

    // Check if we're waiting for a menu response or AI response
    const flowState = conversation.flow_state as FlowState | null;
    
    // Check if in AI conversation mode
    if (flowState?.awaitingAIResponse && flowState.aiNodeData) {
      console.log("[FlowExecutor] Continuing AI conversation");
      
      const aiData = flowState.aiNodeData;
      
      // Check for exit keywords to leave AI mode
      const exitKeywords = ["sair", "menu", "atendente", "humano", "voltar", "encerrar"];
      const messageLower = messageContent.toLowerCase().trim();
      
      if (exitKeywords.some(kw => messageLower === kw || messageLower.includes(kw))) {
        console.log("[FlowExecutor] User requested to exit AI mode");
        
        // Clear flow state and transfer to human
        await supabase
          .from("conversations")
          .update({ 
            flow_state: null, 
            is_bot_active: false,
            status: "in_progress"
          })
          .eq("id", conversationId);
        
        const exitMessage = "Entendido! Você será transferido para um atendente. Aguarde um momento.";
        await sendWhatsAppMessage(evolutionUrl, evolutionKey, instanceName, phone, exitMessage);
        
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: exitMessage,
          sender_type: "bot",
          message_type: "text",
        });
        
        return new Response(JSON.stringify({ success: true, message: "Exited AI mode, transferred to human" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Fetch conversation history for context
      const conversationHistory = await fetchConversationHistory(supabase, conversationId, 10);
      
      // Continue AI conversation
      const aiResponse = await callAI(
        aiData.systemPrompt,
        messageContent,
        aiData.model,
        aiData.temperature || 0.7,
        aiData.maxTokens || 1024,
        aiData.knowledgeBase,
        aiData.useOwnApiKey,
        aiData.googleApiKey,
        conversationHistory
      );
      
      await sendWhatsAppMessage(evolutionUrl, evolutionKey, instanceName, phone, aiResponse);
      
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        content: aiResponse,
        sender_type: "bot",
        message_type: "text",
      });
      
      console.log("[FlowExecutor] AI response sent");
      return new Response(JSON.stringify({ success: true, message: "AI conversation continued" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
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
              contactId,
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
        // Invalid option - first check if this is a trigger for a new flow
        console.log("[FlowExecutor] Invalid menu option, checking for trigger match...");
        
        // Get all active flows to check for triggers
        const { data: allFlows } = await supabase
          .from("chatbot_flows")
          .select("*")
          .eq("is_active", true);

        let foundTrigger = false;
        
        if (allFlows) {
          for (const flow of allFlows) {
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

            const matchingTrigger = findMatchingTrigger(nodes, edges, messageContent, false, connectionId);
            
            if (matchingTrigger) {
              console.log("[FlowExecutor] Found trigger match, restarting flow:", flow.id);
              
              // Clear flow state and set new active flow
              await supabase
                .from("conversations")
                .update({ 
                  flow_state: null, 
                  active_flow_id: flow.id,
                  is_bot_active: true 
                })
                .eq("id", conversationId);

              // Execute the new flow
              const startNode = getNextNode(nodes, edges, matchingTrigger.id);
              if (startNode) {
                await executeFlowFromNode(
                  supabase,
                  nodes,
                  edges,
                  startNode,
                  conversationId,
                  contactId,
                  phone,
                  messageContent,
                  evolutionUrl,
                  evolutionKey,
                  instanceName,
                  contactName,
                  flow.id
                );
              }

              foundTrigger = true;
              break;
            }
          }
        }

        if (!foundTrigger) {
          // No trigger found, show invalid option message with menu title
          console.log("[FlowExecutor] No trigger match, showing invalid option message");
          
          const menuTitle = flowState.menuTitle || "Por favor, escolha uma das opções:";
          let menuText = `Opção inválida. ${menuTitle}\n\n`;
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
        }

        return new Response(JSON.stringify({ success: true, message: foundTrigger ? "Trigger matched, flow restarted" : "Invalid option, asked again" }), {
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
      contactId,
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
