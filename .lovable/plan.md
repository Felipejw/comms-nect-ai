

## Correcoes na Pagina de Atendimento e Diagnostico

### Problemas identificados e solucoes

---

### 1. Mensagens nao atualizam em tempo real

**Causa**: O hook `useMessages` ja tem subscription de realtime para INSERTs, mas a conversa selecionada (`selectedConversation`) nao e atualizada quando uma nova conversa chega via realtime. O componente pode estar com o objeto de conversa desatualizado (stale).

**Solucao**: Adicionar um `useEffect` no `Atendimento.tsx` que, ao detectar invalidacao do cache de conversas, atualiza o `selectedConversation` com os dados mais recentes do cache. Tambem garantir que o realtime de `messages` tambem escute eventos UPDATE (para delivery_status e is_read).

**Arquivo**: `src/pages/Atendimento.tsx`
- Adicionar efeito que sincroniza `selectedConversation` com dados do cache quando `conversations` muda
- No `useMessages`, tambem escutar UPDATE events para refletir status de leitura/entrega

**Arquivo**: `src/hooks/useConversations.ts`
- No `useMessages`, adicionar listener para UPDATE alem de INSERT no canal realtime

---

### 2. Audio nao reproduz (mostra "[Audio]" em vez do player)

**Causa**: Os audios da conversa do Ferdinando estao salvos no banco COM `message_type = 'audio'` mas SEM `media_url`. O servidor Baileys envia o audio como base64 no campo `mediaUrl`, mas se o download falhar ou o base64 nao for processado corretamente, `mediaUrl` fica null. O webhook salva a mensagem sem `media_url`.

O codigo atual no `Atendimento.tsx` (linha 1048-1055) ja trata isso: se `media_url` existe, mostra o `AudioPlayer`; se nao, mostra o texto "[Audio]". O problema e que as mensagens de audio estao chegando sem a midia.

**Solucao**: Adicionar na interface um botao para tentar baixar a midia posteriormente via Edge Function `download-whatsapp-media` quando a `media_url` esta vazia. Isso permite ao atendente clicar para buscar o audio que nao foi processado no momento do webhook.

**Arquivo**: `src/pages/Atendimento.tsx`
- Na secao onde mostra "Mensagem de audio" sem media_url, adicionar botao "Baixar audio" que invoca a Edge Function `download-whatsapp-media`
- Ao obter sucesso, atualizar o cache local com a nova media_url

---

### 3. Remover icone amarelo de exclamacao (LID indicator)

**Causa**: O icone amarelo de exclamacao aparece no header da conversa (linha 1742-1760) para contatos que so possuem identificador LID. O usuario quer remover esse indicador visual.

**Solucao**: Remover o bloco de codigo que renderiza o botao com icone `Info` amarelo no header da conversa.

**Arquivo**: `src/pages/Atendimento.tsx`
- Remover o bloco de linhas 1741-1760 (TooltipProvider com o botao amarelo de Info para LID contacts)

---

### 4. Painel de perfil do contato fica escuro

**Causa**: O componente `ContactProfilePanel` usa `bg-card` como fundo (linha 142). Na segunda screenshot do usuario (VPS em producao), o fundo aparece rosa/escuro, o que indica que a variavel CSS `--card` pode estar com um valor escuro no tema ativo. Porem, o mais provavel e que o `Sheet` no mobile (linha 2219-2228) esta adicionando overlay escuro por padrao.

**Solucao**: No desktop, o painel ja usa `bg-card`. Verificar e ajustar o componente `ContactProfilePanel` para usar `bg-background` em vez de `bg-card`, e garantir que o `SheetContent` no mobile nao aplique overlay escuro excessivo.

**Arquivo**: `src/components/atendimento/ContactProfilePanel.tsx`
- Trocar `bg-card` por `bg-background` na div principal (linha 142)

---

### 5. Acoes nao ficam salvas no Log de Diagnostico

**Causa**: Confirmado pela consulta ao banco - todos os `user_id` estao null. O trigger `log_activity` ja tem o fallback implementado na migration mais recente, mas o trigger pode nao estar atrelado a todas as tabelas relevantes. Alem disso, as acoes feitas pelo frontend (como atualizar conversas, enviar mensagens) passam pelo Supabase client com `auth.uid()` valido, mas como nao ha trigger de `messages` registrado, essas acoes nao geram logs.

Analisando os triggers existentes:
- `trg_log_contacts` - contacts
- `trg_log_conversations` - conversations (INSERT/UPDATE only)
- `trg_log_connections` - connections
- `trg_log_campaigns` - campaigns
- `trg_log_tags` - tags
- `trg_log_quick_replies` - quick_replies
- `trg_log_chatbot_rules` - chatbot_rules

**Faltam triggers para**: messages, chatbot_flows, flow_nodes, schedules, user_roles, system_settings

O problema principal e que a maioria das acoes na conexao sao feitas via Edge Functions (service_role) que nao tem `auth.uid()`, e o fallback do trigger para `connections` nao extrai user_id de nenhum campo (o CASE nao tem clausula para 'connections').

**Solucao**: 
1. Adicionar migration SQL para criar triggers nas tabelas que faltam
2. Expandir o fallback no CASE do trigger para cobrir mais tabelas

**Migration SQL**:
- Adicionar trigger para `messages` (INSERT apenas, para nao gerar log em cada update de is_read)
- Adicionar trigger para `chatbot_flows` (INSERT/UPDATE/DELETE)
- Adicionar trigger para `system_settings` (INSERT/UPDATE)

---

### Secao tecnica - Resumo das alteracoes

| Arquivo | Alteracao |
|---|---|
| `src/hooks/useConversations.ts` | Adicionar listener UPDATE no canal realtime de messages |
| `src/pages/Atendimento.tsx` | 1. Sincronizar selectedConversation com cache. 2. Botao para baixar audio. 3. Remover icone amarelo LID |
| `src/components/atendimento/ContactProfilePanel.tsx` | Trocar `bg-card` por `bg-background` |
| Migration SQL | Adicionar triggers faltantes e expandir fallback de user_id |

