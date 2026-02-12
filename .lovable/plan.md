

## Correcoes: Media WhatsApp, Grupos, Cor de Conexao e Logs

### 1. Media (imagens, audio, video) nao aparecendo

**Causa raiz**: O codigo so mostra o botao "Baixar" para audios sem `media_url`. Para imagens e videos sem `media_url`, nada e renderizado (condicao `&& message.media_url` impede a exibicao). Alem disso, o servidor Baileys esta offline, o que impede o processamento de midia no momento do webhook.

**Solucao**: Adicionar botoes de download para imagens e videos sem `media_url`, identico ao que ja existe para audio. Isso permite ao atendente tentar buscar a midia manualmente.

**Arquivo**: `src/pages/Atendimento.tsx`
- Adicionar bloco para `message.message_type === "image" && !message.media_url` com botao "Baixar imagem"
- Adicionar bloco para `message.message_type === "video" && !message.media_url` com botao "Baixar video"
- Cada botao invoca a Edge Function `download-whatsapp-media` com o `mediaType` correto

---

### 2. Separacao de Grupos

**Causa raiz**: O codigo de separacao por abas ja funciona corretamente (aba "Grupos" existe). O problema e que o trigger `prevent_duplicate_contacts` normaliza telefones e pode rejeitar numeros de grupo (>15 digitos) em certas situacoes. Alem disso, ha apenas 1 grupo no banco de dados. O grupo existente (`Bigode`) tem `is_group: true` e `phone: 120363423042084921`.

**Verificacao**: A logica de filtro por aba esta correta:
- Aba "Grupos": mostra conversas onde `contact.is_group === true`
- Demais abas: filtram `!isGroup`

**Solucao**: O problema pode ser que novos grupos nao estao sendo criados corretamente. No trigger `prevent_duplicate_contacts`, telefones com >15 digitos sao tratados como invalidos pelo `normalize_phone`. O trigger tenta mover para `whatsapp_lid` se >= 20 digitos, mas IDs de grupo tem ~18 digitos, ficando no limbo - o telefone nao e normalizado mas tambem nao e movido. Para garantir consistencia, ajustar o trigger para ignorar contatos com `is_group = true` (nao normalizar o telefone de grupos).

**Migration SQL**: Atualizar `prevent_duplicate_contacts` para fazer `RETURN NEW` imediatamente quando `NEW.is_group = true`.

---

### 3. Cor de conexao nao atualiza

**Causa raiz**: A tabela `connections` tem RLS que exige `has_role(auth.uid(), 'admin')` para UPDATE. O `updateConnection` no hook `useWhatsAppConnections` faz chamada direta ao Supabase, que e bloqueada se o usuario nao for admin. O erro e silencioso porque o toast de sucesso nao e atingido (vai para `onError`), mas a mensagem de erro pode nao ser clara.

**Solucao**: Substituir a chamada direta `supabase.from("connections").update(...)` pelo helper `adminWrite()` que usa a Edge Function com service_role para contornar RLS.

**Arquivo**: `src/hooks/useWhatsAppConnections.ts`
- Importar `adminWrite` de `@/lib/adminWrite`
- No `updateConnection.mutationFn`, substituir `supabase.from("connections").update(...)` por `adminWrite({ table: "connections", operation: "update", data: updates, filters: { id: connectionId } })`

---

### 4. Logs nao aparecem no Diagnostico

**Causa raiz**: Existem 579 registros de atividade no banco, mas o filtro de `entity_type` usa valores fixos de `ENTITY_LABELS` que nao incluem todos os tipos reais do banco. Alem disso, a acao `receive_message` existe em massa (244 registros) mas o filtro de acoes do dropdown mostra apenas as chaves de `ACTION_LABELS`.

O problema principal e que os filtros de dropdown usam `Object.keys(ACTION_LABELS)` e `Object.keys(ENTITY_LABELS)` como opcoes. Se o usuario selecionar um filtro especifico que nao bate com os dados reais, os logs desaparecem. Alem disso, faltam entradas no mapa para `system_settings` e `schedule`.

Outro fator: o filtro de periodo padrao e "7 dias". Os logs mais recentes sao de 11/02 (ontem), o que esta dentro do periodo.

**Solucao**:
1. Adicionar entradas faltantes nos mapas `ACTION_LABELS` e `ENTITY_LABELS`
2. Adicionar `system_settings` -> "Configuracao" e `schedule` -> "Agendamento" ao ENTITY_LABELS
3. Os filtros de dropdown devem funcionar corretamente com essas adicoes

**Arquivo**: `src/pages/Diagnostico.tsx`
- Adicionar ao `ENTITY_LABELS`: `system_settings: "Configuração"`, `schedule: "Agendamento"`, `chatbot_flow: "Fluxo chatbot"` (ja existe), `queues: "Fila"` (ja existe)
- Confirmar que o `ACTION_LABELS` cobre as acoes reais do banco

---

### Secao tecnica - Resumo

| Arquivo | Alteracao |
|---|---|
| `src/pages/Atendimento.tsx` | Adicionar botoes de download para imagem/video sem media_url |
| `src/hooks/useWhatsAppConnections.ts` | Usar `adminWrite` no `updateConnection` para contornar RLS |
| `src/pages/Diagnostico.tsx` | Adicionar entradas faltantes nos mapas de labels |
| Migration SQL | Ajustar `prevent_duplicate_contacts` para ignorar grupos |

