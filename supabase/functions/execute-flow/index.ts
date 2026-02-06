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
  awaitingScheduleResponse?: boolean;
  scheduleNodeData?: {
    integrationId: string;
    calendarId: string;
    availableSlots: Array<{ start: string; end: string }>;
    eventTitle?: string;
    eventDescription?: string;
    eventDuration?: number;
    sendConfirmation?: boolean;
  };
}

// Baileys server configuration (loaded once per execution)
interface BaileysConfig {
  serverUrl: string;
  apiKey: string;
  sessionName: string;
}

// Load Baileys config from system_settings
async function loadBaileysConfig(supabase: any, connection: any): Promise<BaileysConfig | null> {
  const { data: urlSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "baileys_server_url")
    .single();

  const { data: keySetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "baileys_api_key")
    .single();

  const serverUrl = urlSetting?.value;
  const apiKey = keySetting?.value;

  if (!serverUrl) {
    console.error("[FlowExecutor] Baileys server URL not configured in system_settings");
    return null;
  }

  const sessionData = connection.session_data as Record<string, unknown> | null;
  const sessionName = (sessionData?.sessionName as string) || connection.name.toLowerCase().replace(/\s+/g, "_");

  return { serverUrl, apiKey, sessionName };
}

// Send WhatsApp message through Baileys API
async function sendWhatsAppMessage(
  config: BaileysConfig,
  phone: string,
  content: string,
  mediaUrl?: string,
  mediaType?: string
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["X-API-Key"] = config.apiKey;
    }

    let response;

    if (mediaUrl && mediaType && mediaType !== "text") {
      response = await fetch(`${config.serverUrl}/sessions/${config.sessionName}/send/media`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: phone,
          mediaUrl,
          caption: content,
          mediaType,
        }),
      });
    } else {
      response = await fetch(`${config.serverUrl}/sessions/${config.sessionName}/send/text`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: phone,
          text: content,
        }),
      });
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error("[FlowExecutor] Failed to send message:", JSON.stringify(result));
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
    
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      }
    }
    
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
    
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: fullSystemPrompt },
    ];
    
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    
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
      if (!tagId) return false;
      
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
      
      return !!contactTag;
    }
    
    case "kanban": {
      const kanbanColumnId = nodeData.kanbanColumnId as string;
      if (!kanbanColumnId) return false;
      
      const { data: conversation, error } = await supabase
        .from("conversations")
        .select("kanban_column_id")
        .eq("id", conversationId)
        .single();
      
      if (error) return false;
      return conversation?.kanban_column_id === kanbanColumnId;
    }

    case "business_hours": {
      const startTime = nodeData.startTime as string || "09:00";
      const endTime = nodeData.endTime as string || "18:00";
      
      const now = new Date();
      const brasilOffset = -3 * 60;
      const localTime = new Date(now.getTime() + (brasilOffset + now.getTimezoneOffset()) * 60000);
      
      const currentHours = localTime.getHours();
      const currentMinutes = localTime.getMinutes();
      const currentTimeMinutes = currentHours * 60 + currentMinutes;
      
      const [startHours, startMinutes] = startTime.split(":").map(Number);
      const [endHours, endMinutes] = endTime.split(":").map(Number);
      
      const startTimeMinutes = startHours * 60 + startMinutes;
      const endTimeMinutes = endHours * 60 + endMinutes;
      
      return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
    }

    case "day_of_week": {
      const daysOfWeek = nodeData.daysOfWeek as string[] || [];
      if (daysOfWeek.length === 0) return false;
      
      const now = new Date();
      const brasilOffset = -3 * 60;
      const localTime = new Date(now.getTime() + (brasilOffset + now.getTimezoneOffset()) * 60000);
      
      const currentDay = localTime.getDay().toString();
      return daysOfWeek.includes(currentDay);
    }

    case "message_count": {
      const messageCount = nodeData.messageCount as number || 0;
      const messageOperator = nodeData.messageOperator as string || "greater";
      
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);
      
      if (error) return false;
      
      const actualCount = count || 0;
      
      switch (messageOperator) {
        case "greater": return actualCount > messageCount;
        case "less": return actualCount < messageCount;
        case "equals": return actualCount === messageCount;
        case "greater_equals": return actualCount >= messageCount;
        case "less_equals": return actualCount <= messageCount;
        default: return actualCount > messageCount;
      }
    }
    
    case "message":
    default: {
      const field = nodeData.field as string || "message";
      const operator = nodeData.operator as string || "contains";
      const value = (nodeData.value as string || "").toLowerCase();
      
      let fieldValue = "";
      switch (field) {
        case "message": fieldValue = messageContent.toLowerCase(); break;
        case "contact_name": fieldValue = (contactName || "").toLowerCase(); break;
        case "contact_phone": fieldValue = (contactPhone || "").toLowerCase(); break;
        default: fieldValue = messageContent.toLowerCase();
      }
      
      switch (operator) {
        case "contains": return fieldValue.includes(value);
        case "equals": return fieldValue === value;
        case "not_equals": return fieldValue !== value;
        case "starts_with": return fieldValue.startsWith(value);
        case "ends_with": return fieldValue.endsWith(value);
        default: return fieldValue.includes(value);
      }
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
    const incomingEdge = edges.find(e => e.target_id === trigger.id);
    if (incomingEdge) {
      const sourceNode = nodes.find(n => n.id === incomingEdge.source_id);
      if (sourceNode && sourceNode.type === "whatsapp") {
        const whatsappConnectionId = sourceNode.data.connectionId as string;
        if (connectionId && whatsappConnectionId && whatsappConnectionId !== connectionId) {
          continue;
        }
      }
    }
    
    const triggerType = trigger.data.triggerType as string;
    const triggerValue = (trigger.data.triggerValue as string || "").toLowerCase();
    const messageLower = message.toLowerCase();

    if (triggerType === "new_conversation" && isNewConversation) return trigger;
    
    if (triggerType === "keyword") {
      const keywords = triggerValue.split(",").map(k => k.trim());
      if (keywords.some(k => messageLower.includes(k))) return trigger;
    }
    
    if (triggerType === "phrase" && messageLower.includes(triggerValue)) return trigger;
  }

  return null;
}

// Match user input to menu option
function matchMenuOption(
  userInput: string, 
  menuOptions: Array<{ id: string; text: string }>
): { id: string; text: string } | null {
  const inputLower = userInput.toLowerCase().trim();
  
  const numericInput = parseInt(inputLower, 10);
  if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= menuOptions.length) {
    return menuOptions[numericInput - 1];
  }
  
  for (const option of menuOptions) {
    if (option.text.toLowerCase() === inputLower) return option;
  }
  
  for (const option of menuOptions) {
    if (option.text.toLowerCase().includes(inputLower) || inputLower.includes(option.text.toLowerCase())) {
      return option;
    }
  }
  
  return null;
}

// Format phone number for sending via Baileys
function formatPhoneForBaileys(phone: string, whatsappLid?: string): { formattedPhone: string; isLid: boolean } {
  // If we have a real phone number, use it
  const cleanPhone = phone?.replace(/\D/g, "") || "";
  const isRealPhone = cleanPhone.length >= 10 && cleanPhone.length <= 14;
  
  if (isRealPhone) {
    let formatted = cleanPhone;
    if (!formatted.startsWith("55") && formatted.length <= 11) {
      formatted = "55" + formatted;
    }
    return { formattedPhone: formatted, isLid: false };
  }
  
  // If we have a LID, send via LID protocol (Baileys supports this)
  if (whatsappLid) {
    const cleanLid = whatsappLid.replace(/\D/g, "");
    return { formattedPhone: `${cleanLid}@lid`, isLid: true };
  }
  
  // Phone might be a LID stored as phone (legacy)
  if (cleanPhone.length > 14) {
    return { formattedPhone: `${cleanPhone}@lid`, isLid: true };
  }
  
  // Fallback
  return { formattedPhone: cleanPhone, isLid: false };
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
  baileysConfig: BaileysConfig,
  contactName: string,
  flowId: string
): Promise<void> {
  let currentNode = startNode;
  let iterationCount = 0;
  const maxIterations = 50;

  while (currentNode && iterationCount < maxIterations) {
    iterationCount++;
    console.log("[FlowExecutor] Executing node:", currentNode.type, currentNode.id);

    switch (currentNode.type) {
      case "message": {
        const content = currentNode.data.content as string || "";
        const messageType = currentNode.data.messageType as string || "text";
        const mediaUrl = currentNode.data.mediaUrl as string;
        
        const processedContent = content
          .replace(/\{\{nome\}\}/gi, contactName || "")
          .replace(/\{\{telefone\}\}/gi, phone || "");

        await sendWhatsAppMessage(
          baileysConfig,
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

        await sendWhatsAppMessage(baileysConfig, phone, menuText);
        
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: menuText,
          sender_type: "bot",
          message_type: "text",
        });

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
          const useOwnApiKey = currentNode.data.useOwnApiKey as boolean;
          const googleApiKey = currentNode.data.googleApiKey as string;

          const conversationHistory = await fetchConversationHistory(supabase, conversationId, 10);

          const aiResponse = await callAI(
            systemPrompt, messageContent, model, temperature, maxTokens, 
            knowledgeBase, useOwnApiKey, googleApiKey, conversationHistory
          );

          await sendWhatsAppMessage(baileysConfig, phone, aiResponse);
          
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: aiResponse,
            sender_type: "bot",
            message_type: "text",
          });

          const nextNode = getNextNode(nodes, edges, currentNode.id);
          
          if (nextNode) {
            currentNode = nextNode;
          } else {
            const aiState: FlowState = {
              currentNodeId: currentNode.id,
              awaitingMenuResponse: false,
              awaitingAIResponse: true,
              aiNodeData: { systemPrompt, model, temperature, maxTokens, knowledgeBase, useOwnApiKey, googleApiKey },
              flowId: flowId,
            };
            
            await supabase
              .from("conversations")
              .update({ flow_state: aiState })
              .eq("id", conversationId);
            
            currentNode = null;
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
        }

        currentNode = getNextNode(nodes, edges, currentNode.id);
        break;
      }

      case "transfer": {
        const transferType = currentNode.data.transferType as string || "queue";
        const message = currentNode.data.message as string;
        
        if (message) {
          await sendWhatsAppMessage(baileysConfig, phone, message);
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

        currentNode = null;
        break;
      }

      case "end": {
        const message = currentNode.data.message as string;
        const markAsResolved = currentNode.data.markAsResolved !== false;
        
        if (message) {
          await sendWhatsAppMessage(baileysConfig, phone, message);
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

        currentNode = null;
        break;
      }

      case "whatsapp": {
        currentNode = getNextNode(nodes, edges, currentNode.id);
        break;
      }

      case "condition": {
        const conditionResult = await evaluateCondition(
          supabase, currentNode.data, conversationId, contactId,
          messageContent, contactName, phone
        );
        
        const nextNodeId = conditionResult ? "yes" : "no";
        currentNode = getNextNode(nodes, edges, currentNode.id, nextNodeId);
        break;
      }

      case "schedule": {
        const actionType = currentNode.data.actionType as string || "check_availability";
        
        const { data: integration, error: intError } = await supabase
          .from("integrations")
          .select("*")
          .eq("type", "google_calendar")
          .eq("is_active", true)
          .maybeSingle();

        if (intError || !integration) {
          const errorMsg = "Desculpe, o sistema de agendamento não está disponível no momento.";
          await sendWhatsAppMessage(baileysConfig, phone, errorMsg);
          await supabase.from("messages").insert({
            conversation_id: conversationId, content: errorMsg, sender_type: "bot", message_type: "text",
          });
          currentNode = getNextNode(nodes, edges, currentNode.id);
          break;
        }

        const config = integration.config as Record<string, string>;
        const calendarId = config?.selected_calendar_id || "primary";

        if (actionType === "check_availability") {
          const period = currentNode.data.period as string || "today";
          const serviceDuration = (currentNode.data.serviceDuration as number) || 60;
          const workingHoursStart = currentNode.data.workingHoursStart as string || "09:00";
          const workingHoursEnd = currentNode.data.workingHoursEnd as string || "18:00";
          const maxOptions = (currentNode.data.maxOptions as number) || 5;

          const dates: Date[] = [];
          const today = new Date();
          
          switch (period) {
            case "today": dates.push(today); break;
            case "tomorrow": {
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);
              dates.push(tomorrow);
              break;
            }
            case "next_3_days":
              for (let i = 0; i < 3; i++) { const d = new Date(today); d.setDate(d.getDate() + i); dates.push(d); }
              break;
            case "next_7_days":
              for (let i = 0; i < 7; i++) { const d = new Date(today); d.setDate(d.getDate() + i); dates.push(d); }
              break;
          }

          const allSlots: Array<{ start: string; end: string; displayDate: string; displayTime: string }> = [];

          for (const date of dates) {
            try {
              const { data: slotsData, error: slotsError } = await supabase.functions.invoke("google-calendar", {
                body: {
                  action: "check-availability",
                  integration_id: integration.id,
                  calendar_id: calendarId,
                  date: date.toISOString(),
                  service_duration: serviceDuration,
                  working_hours_start: workingHoursStart,
                  working_hours_end: workingHoursEnd,
                },
              });

              if (!slotsError && slotsData?.available_slots) {
                for (const slot of slotsData.available_slots) {
                  const startDate = new Date(slot.start);
                  const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
                  const dayName = dayNames[startDate.getDay()];
                  const displayDate = `${dayName}, ${startDate.getDate().toString().padStart(2, "0")}/${(startDate.getMonth() + 1).toString().padStart(2, "0")}`;
                  const displayTime = `${startDate.getHours().toString().padStart(2, "0")}:${startDate.getMinutes().toString().padStart(2, "0")}`;
                  
                  allSlots.push({ start: slot.start, end: slot.end, displayDate, displayTime });
                }
              }
            } catch (error) {
              console.error("[FlowExecutor] Error fetching slots for date:", date, error);
            }
          }

          if (allSlots.length === 0) {
            const noSlotsMsg = "Desculpe, não há horários disponíveis no período selecionado. Por favor, tente novamente mais tarde ou entre em contato conosco.";
            await sendWhatsAppMessage(baileysConfig, phone, noSlotsMsg);
            await supabase.from("messages").insert({
              conversation_id: conversationId, content: noSlotsMsg, sender_type: "bot", message_type: "text",
            });
            currentNode = getNextNode(nodes, edges, currentNode.id);
            break;
          }

          const displaySlots = allSlots.slice(0, maxOptions);
          
          let slotsMessage = "📅 *Horários Disponíveis*\n\nEscolha um horário digitando o número correspondente:\n\n";
          displaySlots.forEach((slot, idx) => {
            slotsMessage += `${idx + 1}. ${slot.displayDate} às ${slot.displayTime}\n`;
          });
          slotsMessage += `\n0. Cancelar`;

          await sendWhatsAppMessage(baileysConfig, phone, slotsMessage);
          
          await supabase.from("messages").insert({
            conversation_id: conversationId, content: slotsMessage, sender_type: "bot", message_type: "text",
          });

          const nextNode = getNextNode(nodes, edges, currentNode.id);
          const eventTitle = nextNode?.data?.eventTitle as string || currentNode.data.eventTitle as string || "Agendamento";
          const eventDescription = nextNode?.data?.eventDescription as string || currentNode.data.eventDescription as string || "";
          const eventDuration = nextNode?.data?.eventDuration as number || serviceDuration;
          const sendConfirmation = nextNode?.data?.sendConfirmation !== false;

          const scheduleState: FlowState = {
            currentNodeId: currentNode.id,
            awaitingMenuResponse: false,
            awaitingScheduleResponse: true,
            scheduleNodeData: {
              integrationId: integration.id,
              calendarId,
              availableSlots: displaySlots.map(s => ({ start: s.start, end: s.end })),
              eventTitle, eventDescription, eventDuration, sendConfirmation,
            },
            flowId: flowId,
          };

          await supabase
            .from("conversations")
            .update({ flow_state: scheduleState })
            .eq("id", conversationId);

          currentNode = null;
        } else if (actionType === "create_event") {
          currentNode = getNextNode(nodes, edges, currentNode.id);
        }
        break;
      }

      default:
        currentNode = getNextNode(nodes, edges, currentNode.id);
    }
  }

  if (iterationCount >= maxIterations) {
    console.error("[FlowExecutor] Max iterations reached, stopping execution");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

    if (conversation.is_bot_active === false) {
      return new Response(JSON.stringify({ success: true, message: "Bot disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get connection for this conversation
    let connection = null;

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

    if (!connection && conversation.connection_id) {
      const { data: linkedConnection } = await supabase
        .from("connections")
        .select("*")
        .eq("id", conversation.connection_id)
        .eq("status", "connected")
        .single();
      
      if (linkedConnection) {
        connection = linkedConnection;
      }
    }

    if (!connection) {
      const { data: anyConnection } = await supabase
        .from("connections")
        .select("*")
        .eq("status", "connected")
        .limit(1)
        .single();
      
      connection = anyConnection;
    }

    if (!connection) {
      console.error("[FlowExecutor] No active WhatsApp connection found");
      return new Response(JSON.stringify({ success: false, error: "No active connection" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load Baileys config
    const baileysConfig = await loadBaileysConfig(supabase, connection);
    if (!baileysConfig) {
      return new Response(JSON.stringify({ success: false, error: "Baileys not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contactId = conversation.contact_id;
    const contactName = conversation.contacts?.name || "";
    
    // Determine the correct phone number to use for sending messages
    // Baileys supports both real phone numbers AND LID
    const whatsappLid = conversation.contacts?.whatsapp_lid;
    const contactRealPhone = conversation.contacts?.phone;
    
    const { formattedPhone, isLid } = formatPhoneForBaileys(
      contactRealPhone || contactPhone,
      whatsappLid
    );
    
    const phone = formattedPhone;
    
    if (!phone) {
      console.error("[FlowExecutor] Cannot send message: No valid phone or LID");
      return new Response(JSON.stringify({ success: false, error: "No valid phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log(`[FlowExecutor] Contact: ${contactName}, Phone: ${phone}, isLid: ${isLid}`);

    // Check if we're waiting for a menu response or AI response
    const flowState = conversation.flow_state as FlowState | null;
    
    // Check if in AI conversation mode
    if (flowState?.awaitingAIResponse && flowState.aiNodeData) {
      console.log("[FlowExecutor] Continuing AI conversation");
      
      const aiData = flowState.aiNodeData;
      
      const exitKeywords = ["sair", "menu", "atendente", "humano", "voltar", "encerrar"];
      const messageLower = messageContent.toLowerCase().trim();
      
      if (exitKeywords.some(kw => messageLower === kw || messageLower.includes(kw))) {
        await supabase
          .from("conversations")
          .update({ flow_state: null, is_bot_active: false, status: "in_progress" })
          .eq("id", conversationId);
        
        const exitMessage = "Entendido! Você será transferido para um atendente. Aguarde um momento.";
        await sendWhatsAppMessage(baileysConfig, phone, exitMessage);
        
        await supabase.from("messages").insert({
          conversation_id: conversationId, content: exitMessage, sender_type: "bot", message_type: "text",
        });
        
        return new Response(JSON.stringify({ success: true, message: "Exited AI mode" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const conversationHistory = await fetchConversationHistory(supabase, conversationId, 10);
      
      const aiResponse = await callAI(
        aiData.systemPrompt, messageContent, aiData.model,
        aiData.temperature || 0.7, aiData.maxTokens || 1024,
        aiData.knowledgeBase, aiData.useOwnApiKey, aiData.googleApiKey,
        conversationHistory
      );
      
      await sendWhatsAppMessage(baileysConfig, phone, aiResponse);
      
      await supabase.from("messages").insert({
        conversation_id: conversationId, content: aiResponse, sender_type: "bot", message_type: "text",
      });
      
      return new Response(JSON.stringify({ success: true, message: "AI conversation continued" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Check if in Schedule selection mode
    if (flowState?.awaitingScheduleResponse && flowState.scheduleNodeData) {
      console.log("[FlowExecutor] Processing schedule selection");
      
      const scheduleData = flowState.scheduleNodeData;
      const inputTrimmed = messageContent.trim();
      
      if (inputTrimmed === "0") {
        await supabase
          .from("conversations")
          .update({ flow_state: null })
          .eq("id", conversationId);
        
        const cancelMsg = "Agendamento cancelado. Se precisar de algo mais, é só me chamar! 😊";
        await sendWhatsAppMessage(baileysConfig, phone, cancelMsg);
        
        await supabase.from("messages").insert({
          conversation_id: conversationId, content: cancelMsg, sender_type: "bot", message_type: "text",
        });
        
        return new Response(JSON.stringify({ success: true, message: "Scheduling cancelled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const selectedIndex = parseInt(inputTrimmed, 10) - 1;
      
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= scheduleData.availableSlots.length) {
        const invalidMsg = `Por favor, digite um número de 1 a ${scheduleData.availableSlots.length}, ou 0 para cancelar.`;
        await sendWhatsAppMessage(baileysConfig, phone, invalidMsg);
        
        await supabase.from("messages").insert({
          conversation_id: conversationId, content: invalidMsg, sender_type: "bot", message_type: "text",
        });
        
        return new Response(JSON.stringify({ success: true, message: "Invalid selection" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const selectedSlot = scheduleData.availableSlots[selectedIndex];
      
      const processedTitle = (scheduleData.eventTitle || "Agendamento")
        .replace(/\{\{nome\}\}/gi, contactName || "Cliente")
        .replace(/\{\{telefone\}\}/gi, phone || "");
      
      const processedDescription = (scheduleData.eventDescription || "")
        .replace(/\{\{nome\}\}/gi, contactName || "Cliente")
        .replace(/\{\{telefone\}\}/gi, phone || "")
        + `\n\nAgendado via WhatsApp\nContato: ${contactName || "N/A"}\nTelefone: ${phone || "N/A"}`;
      
      try {
        const { data: eventResult, error: eventError } = await supabase.functions.invoke("google-calendar", {
          body: {
            action: "create-event",
            integration_id: scheduleData.integrationId,
            calendar_id: scheduleData.calendarId,
            title: processedTitle,
            description: processedDescription,
            start_time: selectedSlot.start,
            end_time: selectedSlot.end,
            contact_id: contactId,
            conversation_id: conversationId,
          },
        });
        
        if (eventError) throw eventError;
        
        await supabase
          .from("conversations")
          .update({ flow_state: null })
          .eq("id", conversationId);
        
        const eventDate = new Date(selectedSlot.start);
        const dayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
        const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
        
        const formattedDate = `${dayNames[eventDate.getDay()]}, ${eventDate.getDate()} de ${monthNames[eventDate.getMonth()]}`;
        const formattedTime = `${eventDate.getHours().toString().padStart(2, "0")}:${eventDate.getMinutes().toString().padStart(2, "0")}`;
        
        let confirmationMsg = `✅ *Agendamento Confirmado!*\n\n`;
        confirmationMsg += `📅 *Data:* ${formattedDate}\n`;
        confirmationMsg += `🕐 *Horário:* ${formattedTime}\n`;
        confirmationMsg += `📝 *Serviço:* ${processedTitle}\n\n`;
        confirmationMsg += `Você receberá um lembrete antes do horário agendado.\n\n`;
        confirmationMsg += `Se precisar remarcar ou cancelar, entre em contato conosco!`;
        
        if (scheduleData.sendConfirmation !== false) {
          await sendWhatsAppMessage(baileysConfig, phone, confirmationMsg);
          await supabase.from("messages").insert({
            conversation_id: conversationId, content: confirmationMsg, sender_type: "bot", message_type: "text",
          });
        }
        
        // Continue to next node in flow if exists
        const { data: flowNodes } = await supabase.from("flow_nodes").select("*").eq("flow_id", flowState.flowId);
        const { data: flowEdges } = await supabase.from("flow_edges").select("*").eq("flow_id", flowState.flowId);

        if (flowNodes && flowEdges) {
          const nodes: FlowNode[] = flowNodes.map((n: any) => ({ id: n.id, type: n.type, data: n.data || {} }));
          const edges: FlowEdge[] = flowEdges.map((e: any) => ({ id: e.id, source_id: e.source_id, target_id: e.target_id, label: e.label || undefined }));

          const nextNode = nodes.find(n => {
            const edge = edges.find(e => e.source_id === flowState.currentNodeId && !e.label);
            return edge && n.id === edge.target_id;
          });
          
          if (nextNode) {
            await executeFlowFromNode(
              supabase, nodes, edges, nextNode, conversationId, contactId,
              phone, messageContent, baileysConfig, contactName, flowState.flowId
            );
          }
        }
        
        return new Response(JSON.stringify({ success: true, message: "Event created" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        
      } catch (error) {
        console.error("[FlowExecutor] Error creating event:", error);
        
        const errorMsg = "Desculpe, ocorreu um erro ao criar o agendamento. Por favor, tente novamente.";
        await sendWhatsAppMessage(baileysConfig, phone, errorMsg);
        await supabase.from("messages").insert({
          conversation_id: conversationId, content: errorMsg, sender_type: "bot", message_type: "text",
        });
        
        await supabase.from("conversations").update({ flow_state: null }).eq("id", conversationId);
        
        return new Response(JSON.stringify({ success: false, error: "Failed to create event" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    
    // Handle menu response
    if (flowState?.awaitingMenuResponse && flowState.menuOptions) {
      console.log("[FlowExecutor] Processing menu response:", messageContent);
      
      const selectedOption = matchMenuOption(messageContent, flowState.menuOptions);
      
      if (selectedOption) {
        console.log("[FlowExecutor] User selected option:", selectedOption.text);
        
        await supabase.from("conversations").update({ flow_state: null }).eq("id", conversationId);
        
        const { data: flowNodes } = await supabase.from("flow_nodes").select("*").eq("flow_id", flowState.flowId);
        const { data: flowEdges } = await supabase.from("flow_edges").select("*").eq("flow_id", flowState.flowId);

        if (flowNodes && flowEdges) {
          const nodes: FlowNode[] = flowNodes.map((n: any) => ({ id: n.id, type: n.type, data: n.data || {} }));
          const edges: FlowEdge[] = flowEdges.map((e: any) => ({ id: e.id, source_id: e.source_id, target_id: e.target_id, label: e.label || undefined }));

          const nextNode = getNextNode(nodes, edges, flowState.currentNodeId, selectedOption.id);
          
          if (nextNode) {
            await executeFlowFromNode(
              supabase, nodes, edges, nextNode, conversationId, contactId,
              phone, messageContent, baileysConfig, contactName, flowState.flowId
            );
          }
        }
        
        return new Response(JSON.stringify({ success: true, message: "Menu response processed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Invalid option - check if this is a trigger for a new flow
        const { data: allFlows } = await supabase
          .from("chatbot_flows")
          .select("*")
          .eq("is_active", true);

        let foundTrigger = false;
        
        if (allFlows) {
          for (const flow of allFlows) {
            const { data: nodeData } = await supabase.from("flow_nodes").select("*").eq("flow_id", flow.id);
            if (!nodeData) continue;

            const nodes: FlowNode[] = nodeData.map((n: any) => ({ id: n.id, type: n.type, data: n.data || {} }));
            const { data: edgeData } = await supabase.from("flow_edges").select("*").eq("flow_id", flow.id);
            const edges: FlowEdge[] = (edgeData || []).map((e: any) => ({ id: e.id, source_id: e.source_id, target_id: e.target_id, label: e.label || undefined }));

            const matchingTrigger = findMatchingTrigger(nodes, edges, messageContent, false, connectionId);
            
            if (matchingTrigger) {
              await supabase
                .from("conversations")
                .update({ flow_state: null, active_flow_id: flow.id, is_bot_active: true })
                .eq("id", conversationId);

              const startNode = getNextNode(nodes, edges, matchingTrigger.id);
              if (startNode) {
                await executeFlowFromNode(
                  supabase, nodes, edges, startNode, conversationId, contactId,
                  phone, messageContent, baileysConfig, contactName, flow.id
                );
              }

              foundTrigger = true;
              break;
            }
          }
        }

        if (!foundTrigger) {
          const menuTitle = flowState.menuTitle || "Por favor, escolha uma das opções:";
          let menuText = `Opção inválida. ${menuTitle}\n\n`;
          flowState.menuOptions.forEach((opt, idx) => {
            menuText += `${idx + 1}. ${opt.text}\n`;
          });

          await sendWhatsAppMessage(baileysConfig, phone, menuText);
          await supabase.from("messages").insert({
            conversation_id: conversationId, content: menuText, sender_type: "bot", message_type: "text",
          });
        }

        return new Response(JSON.stringify({ success: true, message: foundTrigger ? "Trigger matched" : "Invalid option" }), {
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
      const { data: nodeData } = await supabase.from("flow_nodes").select("*").eq("flow_id", flow.id);
      if (!nodeData) continue;

      const nodes: FlowNode[] = nodeData.map((n: any) => ({ id: n.id, type: n.type, data: n.data || {} }));
      const { data: edgeData } = await supabase.from("flow_edges").select("*").eq("flow_id", flow.id);
      const edges: FlowEdge[] = (edgeData || []).map((e: any) => ({ id: e.id, source_id: e.source_id, target_id: e.target_id, label: e.label || undefined }));

      const matchingTrigger = findMatchingTrigger(nodes, edges, messageContent, isNewConversation, connectionId);
      
      if (matchingTrigger) {
        activeFlowId = flow.id;
        triggerNode = matchingTrigger;
        flowNodes = nodes;
        flowEdges = edges;
        
        await supabase
          .from("conversations")
          .update({ active_flow_id: flow.id, is_bot_active: true })
          .eq("id", conversationId);

        break;
      }
    }

    if (!activeFlowId || !triggerNode) {
      return new Response(JSON.stringify({ success: true, message: "No matching trigger" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startNode = getNextNode(flowNodes, flowEdges, triggerNode.id);
    
    await executeFlowFromNode(
      supabase, flowNodes, flowEdges, startNode, conversationId, contactId,
      phone, messageContent, baileysConfig, contactName, activeFlowId
    );

    // Log flow execution
    await supabase.from("activity_logs").insert({
      tenant_id: conversation.tenant_id,
      action: "execute_flow",
      entity_type: "chatbot_flow",
      entity_id: activeFlowId,
      metadata: {
        conversation_id: conversationId,
        contact_name: contactName,
        trigger_type: triggerNode?.data?.triggerType,
      },
    }).then(({ error: logErr }: { error: { message: string } | null }) => {
      if (logErr) console.error("[ActivityLog] Error:", logErr.message);
    });

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
