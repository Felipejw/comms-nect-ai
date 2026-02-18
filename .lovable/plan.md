
# Mostrar Numero do WhatsApp para Contatos LID

## Situacao Atual

Quando um contato envia mensagem usando WhatsApp LID (identificador interno do WhatsApp), o sistema mostra "Contato #XXXXXX" porque:

1. O campo `phone` do contato fica vazio (so tem `whatsapp_lid`)
2. O `baileys-webhook` ja tenta resolver o LID chamando `/sessions/{name}/contacts/{lid}@lid` no servidor Baileys
3. **Porem, esse endpoint NAO existe no servidor Baileys** - o `index.ts` nao tem essa rota
4. A resolucao falha silenciosamente e o contato continua sem telefone

## Solucao

Adicionar o endpoint de consulta de contatos no servidor Baileys, que usa a funcao `sock.onWhatsApp()` para verificar se um LID corresponde a um numero real.

### Alteracao 1: `deploy/baileys/src/baileys.ts`

Exportar uma nova funcao `getContactInfo` que usa a API do Baileys para buscar informacoes do contato:

```typescript
export async function getContactInfo(sessionName: string, jid: string) {
  const session = sessions.get(sessionName);
  if (!session) return null;
  if (session.status !== 'connected') return null;

  try {
    // Tentar buscar o contato no store interno do Baileys
    const contact = await session.sock.onWhatsApp(jid);
    if (contact && contact.length > 0) {
      return {
        jid: contact[0].jid,
        exists: contact[0].exists,
        phone: contact[0].jid?.replace('@s.whatsapp.net', '') || null
      };
    }
    return null;
  } catch (err) {
    logger.error({ err, jid }, 'Error getting contact info');
    return null;
  }
}
```

### Alteracao 2: `deploy/baileys/src/index.ts`

Adicionar a rota GET `/sessions/:name/contacts/:jid`:

```typescript
app.get('/sessions/:name/contacts/:jid', async (req, res) => {
  try {
    const sessionName = req.params.name;
    const jid = req.params.jid;
    const result = await getContactInfo(sessionName, jid);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
```

### Sem alteracoes no frontend

O frontend ja esta preparado:
- `getContactDisplayName()` ja mostra o telefone formatado quando o campo `phone` existe
- `resolveLidInBackground()` no webhook ja faz o UPDATE no banco quando consegue resolver
- A unica peca faltante era o endpoint no Baileys

## Fluxo Apos a Correcao

```text
Contato LID envia mensagem
       |
baileys-webhook recebe
       |
Cria contato com whatsapp_lid (sem phone)
       |
Chama resolveLidInBackground()
       |
GET /sessions/{name}/contacts/{lid}@lid  <-- AGORA EXISTE
       |
Baileys usa onWhatsApp() para resolver
       |
Se encontrou: UPDATE contacts SET phone = numero_real
       |
Frontend exibe o numero formatado
```

## Arquivos Alterados

| Arquivo | Alteracao |
|---------|-----------|
| `deploy/baileys/src/baileys.ts` | Adicionar funcao `getContactInfo` |
| `deploy/baileys/src/index.ts` | Adicionar rota GET `/sessions/:name/contacts/:jid` |

## Apos implementar

1. Publicar no Lovable
2. Na VPS: `cd /opt/sistema && sudo bash deploy/scripts/update.sh`
3. Enviar mensagem de um numero que aparece como "Contato #XXXXXX"
4. O numero real deve aparecer apos a resolucao automatica

**Nota:** Contatos LID antigos serao resolvidos automaticamente quando enviarem uma nova mensagem. Para resolver todos de uma vez, seria necessario um script de migracao separado (opcional).
