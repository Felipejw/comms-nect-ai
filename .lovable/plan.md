
# Corrigir Midia Recebida (Audio e Imagem)

## Problema Raiz Identificado

A funcao `storeMediaFromBase64` no `baileys-webhook` usa `supabaseClient.storage.getPublicUrl()` para gerar a URL da midia. O cliente Supabase dentro da edge function e criado com `SUPABASE_URL = http://kong:8000` (URL interna do Docker).

Resultado: a `media_url` salva no banco e algo como:
```text
http://kong:8000/storage/v1/object/public/whatsapp-media/TES/msgid.ogg
```

O navegador NAO consegue acessar `http://kong:8000` — essa URL so existe dentro da rede Docker. Por isso:
- Audios recebidos ficam carregando para sempre
- Imagens recebidas nao aparecem

O envio funciona porque o upload e feito pelo navegador (que usa `https://app.chatbotwhatsapp.store` como base URL).

## Solucao

Substituir a URL interna (`http://kong:8000`) pela URL publica do site na `media_url` salva no banco.

### Alteracao 1: `supabase/functions/baileys-webhook/index.ts`

Na funcao `storeMediaFromBase64`, apos obter a `publicUrl`, substituir o prefixo interno pelo externo:

```typescript
// Antes (gera URL interna):
return publicUrlData.publicUrl;

// Depois (converte para URL relativa):
const publicUrl = publicUrlData.publicUrl;
// Remove internal Docker URL prefix, keep only the path
const storagePath = publicUrl.replace(/^https?:\/\/[^/]+/, '');
return storagePath; // ex: /storage/v1/object/public/whatsapp-media/TES/msgid.ogg
```

Fazer a mesma correcao nos outros pontos onde `getPublicUrl` e usado no mesmo arquivo (linhas ~392-406 no fallback inline download).

### Alteracao 2: `src/pages/Atendimento.tsx`

Quando `media_url` for um caminho relativo (comeca com `/storage/`), o frontend precisa prefixa-lo com a URL base do Supabase. Adicionar um helper:

```typescript
const resolveMediaUrl = (url: string) => {
  if (!url) return url;
  // Se ja e uma URL absoluta, usar como esta
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // Se for URL interna do Docker, converter para relativa
    if (url.includes('kong:8000') || url.includes('localhost:')) {
      return url.replace(/^https?:\/\/[^/]+/, '');
    }
    return url;
  }
  return url; // caminhos relativos funcionam naturalmente no mesmo dominio
};
```

Aplicar `resolveMediaUrl()` em todos os locais onde `message.media_url` e usado como `src` (imagem, audio, video, documento).

### Alteracao 3: `supabase/functions/download-whatsapp-media/index.ts`

Mesma correcao: ao retornar a URL publica, usar caminho relativo em vez da URL interna.

### Alteracao 4 (opcional): `src/components/atendimento/MediaAutoDownloader.tsx`

Mesma correcao no `getPublicUrl` do upload local.

## Resumo de Arquivos

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/baileys-webhook/index.ts` | Converter `getPublicUrl` para caminho relativo |
| `supabase/functions/download-whatsapp-media/index.ts` | Converter `getPublicUrl` para caminho relativo |
| `src/pages/Atendimento.tsx` | Adicionar `resolveMediaUrl` helper para URLs internas |
| `src/components/atendimento/MediaAutoDownloader.tsx` | Converter `getPublicUrl` para caminho relativo |

## Apos implementar

1. **Publicar** no Lovable
2. Na VPS: `cd /opt/sistema && sudo bash deploy/scripts/update.sh`
3. Enviar uma nova mensagem de audio/imagem para testar
4. Mensagens antigas com URL interna serao corrigidas automaticamente pelo helper no frontend
