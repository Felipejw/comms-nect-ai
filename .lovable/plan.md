
# Remover exibicao de LID no header do chat

## Problema identificado

O contato "Felipe Martins" possui:
- `name_source: 'pushname'` (nome veio do WhatsApp automaticamente)
- `phone: null` (sem numero real)
- `whatsapp_lid: 249687990878288`

A logica de `getContactDisplayName` ja funciona corretamente - mostra o pushName porque nao existe numero de telefone para exibir. O problema esta no **header do chat** (area onde aparece o nome do contato no topo), que tem uma linha separada hardcoded mostrando `LID: ...878288`. Essa informacao tecnica nao deveria aparecer para o usuario.

## O que sera feito

### 1. Remover "LID: ..." do header do chat

**Arquivo:** `src/pages/Atendimento.tsx` (linhas 1682-1689)

Atualmente o subtitulo do header mostra:
```text
formatPhoneDisplay(phone) || "LID: ...878288" || email || "-"
```

Sera alterado para:
- Se tem telefone: mostra telefone formatado
- Se NAO tem telefone (mesmo com LID): mostra apenas o email ou "-"
- O indicador de LID (triangulo amarelo) ja existe ao lado e informa o agente que o contato nao tem numero

### 2. Remover "LID: ..." da lista de conversas (se existir)

Verificar e garantir que a lista lateral de conversas tambem nao exiba o texto "LID:..." em nenhum lugar. A lista ja usa `getDisplayName()` e `getContactSecondaryName()` que tratam isso corretamente.

### 3. Manter o indicador visual de alerta

O triangulo amarelo que aparece no avatar e no header continuara existindo para informar o agente que o contato ainda nao tem numero identificado. Isso e util sem expor informacoes tecnicas como o ID do LID.

## Resultado esperado

| Antes | Depois |
|---|---|
| Felipe Martins | Felipe Martins |
| LID: ...878288 (WhatsApp badge) | - (WhatsApp badge) |
| Triangulo amarelo de alerta | Triangulo amarelo de alerta (sem mudanca) |

Para contatos com telefone, o comportamento nao muda - continuara mostrando o numero formatado.

## Detalhes tecnicos

**Arquivo a modificar:** `src/pages/Atendimento.tsx`

Na secao do header do chat (linhas 1682-1689), remover o fallback para LID:

```text
// Antes:
formatPhoneDisplay(selectedConversation.contact?.phone)
  || (selectedConversation.contact?.whatsapp_lid
    ? `LID: ...${selectedConversation.contact.whatsapp_lid.slice(-6)}`
    : null)
  || selectedConversation.contact?.email
  || "-"

// Depois:
formatPhoneDisplay(selectedConversation.contact?.phone)
  || selectedConversation.contact?.email
  || "-"
```

Isso remove a exibicao tecnica do LID mantendo toda a funcionalidade de alerta e resolucao automatica intacta.
