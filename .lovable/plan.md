

# Corrigir Upload e Download de Midia na VPS

## Problemas Identificados

### Problema 1: "new row violates row-level security policy" ao enviar audio

A secao de storage no `init.sql` esta dentro de um unico bloco `DO/EXCEPTION` (linhas 989-1068). Se qualquer policy falha na criacao (ex: conflito de nomes), o `EXCEPTION` captura o erro e **nenhuma das policies seguintes e criada**. Resultado: o bucket `whatsapp-media` existe mas nao tem permissao de INSERT para usuarios autenticados.

Alem disso, o bucket `whatsapp-media` tem uma lista restrita de `allowed_mime_types` que **nao inclui `audio/webm`** (formato padrao de gravacao de audio no navegador).

### Problema 2: Audios recebidos nao carregam

O `MediaAutoDownloader` tenta baixar midia do endpoint `GET /sessions/{name}/messages/{id}/media` no servidor Baileys. **Esse endpoint nao existe.** O servidor Baileys so tem endpoints para criar/listar sessoes e enviar mensagens. A funcao `downloadMediaMessage` do Baileys ja e usada internamente (no processamento de mensagens recebidas), mas nao esta exposta via HTTP.

A midia ja e enviada como base64 no webhook, mas se o upload para o storage falha (por causa das policies quebradas), a `media_url` fica nula e o `MediaAutoDownloader` tenta baixar de um endpoint que nao existe.

## Solucao

### 1. Corrigir policies de storage no `init.sql`

Separar cada bucket em seu proprio bloco `DO/EXCEPTION` independente para que uma falha nao afete os outros. Adicionar `audio/webm` e `audio/wav` aos tipos permitidos. Usar `TO authenticated` explicitamente nas policies de INSERT.

**Arquivo:** `deploy/supabase/init.sql` (linhas 989-1068)

### 2. Adicionar endpoint de download de midia no servidor Baileys

Criar a rota `GET /sessions/:name/messages/:messageId/media` que:
- Busca a mensagem no store interno do Baileys
- Usa `downloadMediaMessage` para baixar o conteudo
- Retorna como JSON `{ base64, mimetype }` ou como binario

**Arquivos:**
- `deploy/baileys/src/baileys.ts` - exportar nova funcao `downloadMedia(sessionName, messageId)`
- `deploy/baileys/src/index.ts` - adicionar rota GET

### 3. Remover restricao de mime types do bucket

O bucket `whatsapp-media` passara a aceitar qualquer tipo de arquivo (removendo `allowed_mime_types` e `file_size_limit`), pois a validacao ja e feita no codigo. Isso evita problemas futuros com formatos nao previstos.

### 4. Guardar mensagens para download posterior

Para que o endpoint de download funcione, o Baileys precisa manter as mensagens em memoria. Adicionar um store de mensagens simples no `baileys.ts`.

## Detalhes Tecnicos

### Alteracoes em `deploy/supabase/init.sql`

Substituir o bloco unico de storage (linhas 989-1068) por blocos independentes:

```text
-- Bucket: chat-attachments
DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('chat-attachments', 'chat-attachments', true)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
  CREATE POLICY "Authenticated users can upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- (repetir para SELECT e DELETE)

-- Bucket: whatsapp-media (SEM restricao de mime types)
DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('whatsapp-media', 'whatsapp-media', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can upload whatsapp media" ON storage.objects;
  CREATE POLICY "Anyone can upload whatsapp media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-media');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- (repetir para SELECT, UPDATE, DELETE)
```

### Alteracoes em `deploy/baileys/src/baileys.ts`

Adicionar store de mensagens e funcao de download:

```text
// Store de mensagens para download posterior
const messageStore = new Map<string, Map<string, proto.IWebMessageInfo>>();

// Na funcao processIncomingMessage, armazenar mensagem:
// messageStore.get(sessionName)?.set(msgId, msg);

// Nova funcao exportada:
export async function downloadMedia(sessionName, messageId) {
  const session = sessions.get(sessionName);
  const msg = messageStore.get(sessionName)?.get(messageId);
  if (!session || !msg) return null;

  const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
    logger, reuploadRequest: session.sock.updateMediaMessage
  });

  return { base64: buffer.toString('base64'), mimetype: ... };
}
```

### Alteracoes em `deploy/baileys/src/index.ts`

Adicionar nova rota:

```text
// Download de midia de mensagem
app.get('/sessions/:name/messages/:messageId/media', async (req, res) => {
  const { name, messageId } = req.params;
  const result = await downloadMedia(name, messageId);
  if (!result) return res.status(404).json({ error: 'Media not found' });
  res.json(result);
});
```

## Resumo de arquivos alterados

| Arquivo | Alteracao |
|---------|-----------|
| `deploy/supabase/init.sql` | Separar policies de storage em blocos independentes, remover restricao de mime types |
| `deploy/baileys/src/baileys.ts` | Adicionar store de mensagens e funcao `downloadMedia` |
| `deploy/baileys/src/index.ts` | Adicionar endpoint GET `/sessions/:name/messages/:messageId/media` |

## Apos implementar

1. **Publicar** o projeto no Lovable
2. Na VPS, executar: `cd /opt/sistema && sudo bash deploy/scripts/update.sh`
3. Executar o SQL de correcao no banco local da VPS (sera fornecido como comando para rodar via `psql`)

