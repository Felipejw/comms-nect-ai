
# Mostrar numero do WhatsApp e diferenciar contatos salvos

## Problema

Atualmente o sistema tem dois comportamentos indesejados:

1. **Contatos com LID**: Mostra "LID: ...878288" ao inves do numero do WhatsApp. O numero real ainda nao foi resolvido para esse contato, entao nao ha como exibi-lo diretamente.

2. **Contatos nao salvos**: Quando o nome veio automaticamente do WhatsApp (pushName, ex: "Felipe Martins"), ele aparece como se fosse um contato salvo. O usuario quer que contatos nao salvos manualmente mostrem o **numero de telefone** como identificador principal.

## Solucao

Adicionar um campo `name_source` na tabela `contacts` para distinguir entre:
- `pushname` -- nome veio automaticamente do WhatsApp
- `manual` -- nome foi editado manualmente pelo usuario

Com essa informacao, o frontend pode decidir: se o nome foi apenas um pushName e existe um telefone, mostrar o telefone como identificador principal (e o nome como informacao secundaria).

Para contatos apenas com LID (sem numero real), continuar mostrando o LID mascarado ate que a resolucao automatica descubra o numero.

## Alteracoes

### Etapa 1: Migracao de banco de dados
Adicionar coluna `name_source` na tabela `contacts`:
- Tipo: `text`, default `'auto'`
- Atualizar contatos existentes que tem `whatsapp_lid` e nao tem `phone` para `name_source = 'pushname'`
- Contatos com nome igual ao telefone formatado (ex: "55 47 9642-0547") manter como `'auto'`

### Etapa 2: Atualizar o webhook (baileys-webhook)
**Arquivo:** `supabase/functions/baileys-webhook/index.ts`
- Ao criar contato com pushName, definir `name_source: 'pushname'`
- Ao criar contato sem pushName, definir `name_source: 'auto'`

### Etapa 3: Atualizar o frontend para salvar `name_source: 'manual'` ao editar nome
**Arquivo:** `src/hooks/useContacts.ts`
- Na mutacao `useUpdateContact`, quando o campo `name` for atualizado, incluir `name_source: 'manual'`

**Arquivo:** `src/components/atendimento/ContactProfilePanel.tsx`
- Na funcao `handleSaveName`, incluir `name_source: 'manual'` na chamada de update

### Etapa 4: Atualizar a logica de exibicao de nome
**Arquivo:** `src/hooks/useContactDisplayName.ts`
- Adicionar `name_source` ao tipo `ContactInfo`
- Alterar `getContactDisplayName`:
  - Se `name_source === 'manual'`: manter nome como identificador principal
  - Se `name_source !== 'manual'` e existe `phone`: mostrar telefone formatado como identificador principal
  - Se so tem LID: mostrar `Contato #XXXXXX` como hoje

### Etapa 5: Atualizar o tipo Conversation para incluir `name_source`
**Arquivo:** `src/hooks/useConversations.ts`
- Adicionar `name_source` na interface `contact` e na query select

### Etapa 6: Exibir nome do pushName como informacao secundaria
**Arquivo:** `src/pages/Atendimento.tsx`
- Na lista de conversas e no header da conversa, quando o contato nao e salvo manualmente:
  - Linha principal: numero de telefone formatado (ou LID mascarado)
  - Linha secundaria (subtitulo): nome do pushName em texto menor/cinza

## Resultado esperado

| Situacao | Hoje | Depois |
|---|---|---|
| Contato com nome manual + telefone | "Joao Silva" | "Joao Silva" (sem mudanca) |
| Contato com pushName + telefone | "Felipe Martins" | "+55 (47) 99642-0547" (com "Felipe Martins" abaixo) |
| Contato com pushName + apenas LID | "Felipe Martins" | "Felipe Martins" (sem telefone para mostrar) |
| Contato sem nome + telefone | "+55 (47) 99999-9999" | "+55 (47) 99999-9999" (sem mudanca) |
| Contato sem nome + apenas LID | "Contato #878288" | "Contato #878288" (sem mudanca) |

## Detalhes tecnicos

### Migracao SQL:
```text
ALTER TABLE contacts ADD COLUMN name_source text DEFAULT 'auto';

-- Contatos com LID e sem phone vieram do pushName
UPDATE contacts SET name_source = 'pushname' 
WHERE whatsapp_lid IS NOT NULL 
  AND name IS NOT NULL 
  AND name != '' 
  AND name NOT LIKE 'Contato%';

-- Contatos com phone cujo nome parece ser um pushName real (nao numero)
UPDATE contacts SET name_source = 'pushname'
WHERE phone IS NOT NULL 
  AND name IS NOT NULL 
  AND name !~ '^\d[\d\s\-\+\(\)]+$'
  AND name NOT IN ('Contato Desconhecido', 'Chatbot Whats', 'Unknown')
  AND name NOT LIKE 'Contato #%';
```

### Alteracao na logica de exibicao (`getContactDisplayName`):
```text
// Nova prioridade:
// 1. Se name_source === 'manual' e nome valido -> nome
// 2. Se tem telefone -> telefone formatado
// 3. Se tem nome (pushName) -> nome
// 4. Se tem LID -> "Contato #XXXXXX"
// 5. Fallback -> "Contato"
```

### Arquivos a modificar:
- Migracao SQL (nova coluna `name_source`)
- `supabase/functions/baileys-webhook/index.ts` -- setar `name_source` na criacao
- `src/hooks/useContactDisplayName.ts` -- nova logica de prioridade
- `src/hooks/useConversations.ts` -- incluir `name_source` na query
- `src/hooks/useContacts.ts` -- setar `name_source: 'manual'` ao editar
- `src/components/atendimento/ContactProfilePanel.tsx` -- setar `name_source: 'manual'` ao editar nome
- `src/pages/Atendimento.tsx` -- exibir nome secundario quando aplicavel
