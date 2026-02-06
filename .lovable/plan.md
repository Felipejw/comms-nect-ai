
# Fix: Exibir identificador do contato e permitir envio para LID

## Problemas Identificados

### 1. Numero nao aparece no header da conversa
Na linha 1676 do `Atendimento.tsx`, o codigo exibe:
```
formatPhoneDisplay(selectedConversation.contact?.phone) || selectedConversation.contact?.email || "-"
```
Como o contato agora tem `phone: null` (corrigido corretamente para `whatsapp_lid`), o display mostra apenas "-". Nao ha fallback para mostrar o LID como identificador.

### 2. Botao de enviar desabilitado para contatos LID
Na linha 2125, o botao de enviar e desabilitado quando `isLidOnlyContact()` retorna true. Porem, o backend (`send-whatsapp`) **ja suporta** envio para enderecos LID via Baileys. O frontend esta bloqueando desnecessariamente.

## Correcoes

### Arquivo: `src/pages/Atendimento.tsx`

**Correcao 1 - Exibir identificador do contato (linha 1674-1677):**
Alterar o fallback para mostrar o LID quando nao ha telefone:
```
{formatPhoneDisplay(selectedConversation.contact?.phone)
  || (selectedConversation.contact?.whatsapp_lid
    ? `LID: ...${selectedConversation.contact.whatsapp_lid.slice(-6)}`
    : null)
  || selectedConversation.contact?.email
  || "-"}
```

**Correcao 2 - Permitir envio para contatos LID (linhas 2121-2126):**
Remover `isLidOnlyContact(selectedConversation?.contact)` da condicao `disabled` do botao de enviar. O backend ja trata envio para LID corretamente.

**Correcao 3 - Icone do botao enviar (linhas 2128-2133):**
Remover a condicao que mostra icone de alerta no botao de enviar para contatos LID. Mostrar o icone normal de enviar.

**Correcao 4 - Estilo do botao (linhas 2114-2119):**
Remover a condicao de estilo que aplica `bg-muted cursor-not-allowed` para contatos LID.

**Correcao 5 - Tooltip bloqueante (linhas 2138-2142):**
Remover o tooltip que diz "Nao e possivel enviar mensagens" para contatos LID.

### Arquivo: `src/components/atendimento/LidContactIndicator.tsx`

Atualizar o texto do alerta para informar que o envio e possivel, mas que o numero real ainda nao foi identificado. Mudar de "Nao e possivel enviar mensagens" para algo como "O numero real deste contato ainda nao foi identificado, mas voce pode enviar mensagens normalmente."

## Resultado esperado
1. O header da conversa mostrara "LID: ...878288" como identificador ao inves de "-"
2. O botao de enviar estara habilitado, permitindo enviar mensagens para contatos LID
3. O alerta LID continuara visivel mas com texto informativo (nao bloqueante)
