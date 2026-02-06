

# Melhorias: Preview de Mensagem, Dropdown de Setor e Grupos WhatsApp

## Problema 1 - "Nova conversa" em vez da ultima mensagem

O campo `subject` da conversa so e atualizado quando voce envia uma mensagem pela interface do sistema (via `useSendMessage`). Quando mensagens chegam pelo webhook do WhatsApp, o `subject` nunca e atualizado -- fica `null`, e o frontend mostra "Nova conversa".

**Solucao**: Atualizar o webhook (`baileys-webhook`) para salvar um preview da ultima mensagem no campo `subject` sempre que uma mensagem for recebida ou enviada (fromMe). Para audios, imagens e videos, usar icones descritivos como "Audio", "Imagem", etc.

---

## Problema 2 - Dropdown de Setor nao abre

O badge "Setor" na lista de conversas usa um `DropdownMenu` do Radix, mas tem `onPointerDown` e `onClick` com `e.stopPropagation()` no trigger. Isso pode causar conflito com o clique na conversa. Alem disso, a renderizacao do dropdown pode estar sendo bloqueada pelo container `overflow-y-auto` da lista de conversas.

**Solucao**: Ajustar o `DropdownMenuContent` para usar portal rendering e garantir que o z-index e posicionamento funcionem corretamente sobre a lista de conversas scrollavel.

---

## Problema 3 - Grupos WhatsApp misturados com contatos

O numero grande (`120363423042084921`) e o identificador de um grupo WhatsApp (`@g.us`). O servidor Baileys ja detecta `isGroup` e envia essa informacao no payload do webhook, mas o webhook ignora completamente esse dado. O grupo e salvo como um contato normal.

**Solucao em 3 partes**:

1. **Banco de dados**: Adicionar coluna `is_group` (boolean) na tabela `contacts` para marcar contatos que sao grupos
2. **Webhook**: Usar o campo `isGroup` do payload para marcar o contato como grupo e usar o nome do grupo (pushName) como nome
3. **Frontend**: Filtrar grupos separados na lista de conversas, com uma aba ou filtro dedicado

---

## Detalhes Tecnicos

### Correcao 1 - Webhook: Atualizar subject com preview da mensagem

**Arquivo**: `supabase/functions/baileys-webhook/index.ts`

Ao salvar a mensagem (apos a insercao na tabela `messages`), atualizar o campo `subject` da conversa com um preview do conteudo:

```text
let subjectPreview = body;
if (messageType === 'audio') subjectPreview = 'Audio';
else if (messageType === 'image') subjectPreview = 'Imagem';
else if (messageType === 'video') subjectPreview = 'Video';
else if (messageType === 'document') subjectPreview = 'Documento';
else if (messageType === 'sticker') subjectPreview = 'Figurinha';
else subjectPreview = body.substring(0, 100);
```

Adicionar `subject: subjectPreview` nos updates da conversa (tanto no update de conversa existente quanto na criacao de nova conversa).

### Correcao 2 - Dropdown de Setor

**Arquivo**: `src/pages/Atendimento.tsx`

O `DropdownMenuContent` precisa de ajustes para funcionar dentro da lista scrollavel:
- Garantir que o portal rendering esta ativo (comportamento padrao do Radix)
- Aumentar o z-index para ficar acima de tudo
- Verificar se `onPointerDown` no trigger nao esta impedindo o dropdown de abrir

### Correcao 3 - Separacao de Grupos

**Migracao SQL**: Adicionar coluna `is_group` na tabela `contacts`:

```text
ALTER TABLE contacts ADD COLUMN is_group BOOLEAN DEFAULT false;
```

Tambem atualizar o contato de grupo existente:

```text
UPDATE contacts SET is_group = true WHERE phone = '120363423042084921';
```

**Webhook** (`baileys-webhook/index.ts`):
- Ao criar/buscar contato, verificar se `msg.isGroup` e `true`
- Se for grupo, marcar `is_group = true` no contato
- Usar `msg.pushName` como nome do grupo (grupos enviam o nome do grupo como pushName)

**Frontend** (`Atendimento.tsx`):
- Adicionar uma aba "Grupos" nas tabs de conversas (ao lado de "Atendendo", "Finalizados", "Chatbot")
- Filtrar conversas com `contact.is_group === true` para a aba Grupos
- Excluir grupos das abas normais de atendimento
- Usar icone diferenciado para grupos (por exemplo, `Users` do lucide ao inves do avatar)

**Tipo TypeScript** (`useConversations.ts`):
- Adicionar `is_group?: boolean` ao tipo do contact dentro de Conversation
- Incluir `is_group` no select da query de conversas

### Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/baileys-webhook/index.ts` | Atualizar `subject` com preview da mensagem; detectar e marcar grupos |
| `src/pages/Atendimento.tsx` | Corrigir dropdown de Setor; adicionar aba Grupos; icone diferenciado para grupos |
| `src/hooks/useConversations.ts` | Adicionar `is_group` no select e no tipo |
| Migracao SQL | Adicionar coluna `is_group` na tabela `contacts` |

