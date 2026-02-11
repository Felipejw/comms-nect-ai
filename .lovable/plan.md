

## Analise do Chatbot: Problemas Encontrados

### Status Geral

O chatbot tem uma **interface visual completa e bem construida** (editor de fluxos com drag-and-drop, 10 tipos de blocos, painel de configuracao detalhado). Porem, o **backend de execucao esta quebrado** -- o fluxo nunca e executado quando uma mensagem chega.

---

### PROBLEMA CRITICO: Handler do execute-flow esta vazio

**Arquivo:** `supabase/functions/execute-flow/index.ts` (linhas 953-959)

O handler HTTP que recebe as requisicoes do webhook esta assim:

```text
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ... keep existing code (flow execution logic - processNode, all node type handling)
};
```

O comentario `// ... keep existing code` e um placeholder que nunca foi preenchido. Todas as funcoes auxiliares estao implementadas (findMatchingTrigger, executeFlowFromNode, matchMenuOption, etc.), mas **nenhuma delas e chamada** porque o handler nao faz nada.

**Impacto:** O webhook chama `execute-flow` com os dados da mensagem, mas a funcao retorna `undefined` (nenhuma Response), entao o fluxo nunca executa.

---

### O que esta funcionando (UI)

- Editor visual de fluxos com React Flow (arrastar/soltar blocos)
- 10 tipos de blocos: Gatilho, Mensagem, WhatsApp, IA, Aguardar, Menu, Agendar, CRM, Transferir, Encerrar
- Painel de configuracao completo para cada bloco
- Validacao visual nos blocos (badges de aviso)
- CRUD de fluxos (criar, editar, excluir, ativar/desativar)
- Salvamento de nodes/edges no banco de dados
- Sidebar colapsavel com busca

### O que esta funcionando (Backend)

- Todas as funcoes auxiliares: envio de mensagem, chamada de IA (Lovable AI + Google AI Studio), busca de gatilhos, execucao de menu, delay, transferencia, CRM, agendamento
- Integracao com Google Calendar para agendamentos
- Suporte a LID (Lead ID) do WhatsApp
- Historico de conversa para contexto da IA
- Tabelas no banco: `chatbot_flows`, `flow_nodes`, `flow_edges` + campos `is_bot_active`, `active_flow_id`, `flow_state` na tabela `conversations`

---

### Correcao necessaria

Implementar o handler da funcao `execute-flow` que deve:

1. Receber os dados do webhook (`conversationId`, `contactId`, `message`, `connectionId`, `isNewConversation`)
2. Verificar se a conversa tem um `flow_state` pendente (menu aguardando resposta, IA aguardando resposta, agendamento aguardando resposta)
3. Se sim, continuar o fluxo a partir do estado salvo
4. Se nao, buscar todos os fluxos ativos, encontrar um gatilho que corresponda a mensagem
5. Se encontrar, ativar o fluxo na conversa e executar a partir do gatilho
6. Carregar a configuracao do Baileys e os dados do contato
7. Chamar `executeFlowFromNode()` para executar os blocos em sequencia

### Secao Tecnica

**Arquivo modificado:** `supabase/functions/execute-flow/index.ts`

O handler precisa:
- Fazer parse do body JSON
- Criar cliente Supabase com service role
- Buscar dados da conversa (incluindo `flow_state`, `active_flow_id`)
- Buscar dados do contato (nome, telefone, whatsapp_lid)
- Buscar a conexao WhatsApp associada a conversa
- Carregar config do Baileys (URL do servidor, API key, nome da sessao)
- Verificar se ha estado pendente (menu/IA/agendamento) e processar a resposta
- Ou buscar fluxos ativos e encontrar gatilho correspondente
- Chamar `executeFlowFromNode` com todos os parametros
- Retornar Response com status de sucesso ou erro

Estimativa: ~150 linhas de codigo no handler, usando todas as funcoes auxiliares que ja existem no arquivo.
