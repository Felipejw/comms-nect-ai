

# Correcao: Upload RLS + Audio Design + Remover Banner

## Problema 1: "new row violates row-level security policy"

A causa raiz e que as politicas de INSERT no storage do VPS nao incluem `TO authenticated`. No `init.sql`, a politica do `whatsapp-media` (linha 1033) e criada SEM `TO authenticated`, o que significa que so funciona com `service_role`. A politica do `chat-attachments` (linha 1007) esta correta COM `TO authenticated`, porem o `update.sh` (linhas 197-209) cria politicas DUPLICADAS tambem SEM `TO authenticated`.

**Solucao**: 
- Corrigir o `update.sh` para dropar as politicas antigas e recriar com `TO authenticated`
- Corrigir o `init.sql` para que o `whatsapp-media` tambem tenha `TO authenticated`
- No `useFileUpload.ts`, manter `chat-attachments` como primario (politica correta)

## Problema 2: Design do audio nao mudou

O print mostra "Mensagem de audio" com "Tentar novamente" e "[Audio]" abaixo -- isso e exatamente o visual antigo do MediaAutoDownloader. Embora as alteracoes tenham sido feitas no codigo, o deploy no VPS pode nao ter atualizado corretamente. O texto "[Audio]" ja foi tratado no ultimo deploy (regex no Atendimento.tsx). O visual do MediaAutoDownloader precisa ser verificado.

## Problema 3: Banner "X audios sendo processados..."

O componente `AudioProcessingStatus` mostra um banner no topo do chat. O usuario quer remove-lo.

**Solucao**: Remover a renderizacao do `AudioProcessingStatus` no Atendimento.tsx (linha 1950).

---

## Detalhes Tecnicos

### Arquivo 1: `deploy/scripts/update.sh` (linhas 192-210)

Corrigir as politicas de storage para incluir `TO authenticated`:

```sql
-- DROP politicas antigas sem TO authenticated
DROP POLICY IF EXISTS "Auth upload whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload chat-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload WhatsApp media" ON storage.objects;

-- Recriar COM TO authenticated
CREATE POLICY "Auth upload whatsapp-media" 
  ON storage.objects FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Auth upload chat-attachments" 
  ON storage.objects FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'chat-attachments');
```

### Arquivo 2: `deploy/supabase/init.sql` (linhas 1033-1034)

Corrigir a politica do whatsapp-media para incluir `TO authenticated`:

```sql
CREATE POLICY "Service role can upload WhatsApp media"
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'whatsapp-media');
```

### Arquivo 3: `src/pages/Atendimento.tsx` (linha 1950)

Remover ou comentar a linha que renderiza o `AudioProcessingStatus`:

```tsx
// REMOVER: {messages && <AudioProcessingStatus messages={messages} />}
```

### Arquivo 4: `src/hooks/useFileUpload.ts`

Manter como esta (chat-attachments como primario). Sem alteracoes necessarias.

### Resumo

| Arquivo | Acao |
|---------|------|
| `deploy/scripts/update.sh` | Corrigir politicas RLS com TO authenticated |
| `deploy/supabase/init.sql` | Corrigir politica whatsapp-media INSERT |
| `src/pages/Atendimento.tsx` | Remover AudioProcessingStatus |

### Apos aprovar

Depois de aplicar as mudancas, sera necessario rodar no VPS:

```bash
cd /opt/sistema && sudo bash deploy/scripts/update.sh
```

