
# Corrigir Upload e Download de Audio na VPS

## Problema 1: "Bucket not found" ao enviar arquivo

O hook `useFileUpload.ts` tenta usar o bucket `chat-attachments` primeiro. Se falha, tenta criar o bucket via edge function `admin-write` -- que na VPS pode apontar para o Lovable Cloud em vez do Supabase local. O fallback final usa `whatsapp-media`, mas so chega la apos duas falhas.

### Solucao

Alterar `useFileUpload.ts` para tentar `whatsapp-media` como bucket primario (que e o bucket garantido no `init.sql` da VPS com todas as policies corretas) e `chat-attachments` como fallback.

**Arquivo:** `src/hooks/useFileUpload.ts`
- Inverter a ordem dos buckets: `whatsapp-media` primeiro, `chat-attachments` depois
- Remover a tentativa de criar bucket via `admin-write` (desnecessaria e causa problemas na VPS)
- Simplificar a logica de fallback

---

## Problema 2: Audios recebidos nao carregam

O `MediaAutoDownloader` chama a edge function `download-whatsapp-media` via `supabase.functions.invoke()`. Na VPS, o cliente Supabase agora aponta para o banco local, mas as edge functions do Lovable Cloud nao tem acesso ao Baileys server da VPS.

O problema e que o `download-whatsapp-media` precisa:
1. Consultar `system_settings` para obter a URL do Baileys server
2. Fazer download da midia do Baileys
3. Salvar no storage local

Na VPS, as edge functions rodam no Lovable Cloud e nao conseguem acessar o Baileys server (que esta na rede interna da VPS).

### Solucao

Alterar o `MediaAutoDownloader` para tentar baixar a midia diretamente do Baileys server local antes de chamar a edge function. Isso funciona porque o navegador do usuario ja tem acesso ao dominio da VPS.

**Arquivo:** `src/components/atendimento/MediaAutoDownloader.tsx`
- Adicionar tentativa de download direto via Baileys API (lendo `baileys_server_url` das `system_settings`)
- Se o download direto funcionar, fazer upload para o storage local e atualizar a mensagem
- Manter a edge function como fallback

---

## Resumo das alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/hooks/useFileUpload.ts` | Inverter ordem dos buckets, remover criacao via admin-write |
| `src/components/atendimento/MediaAutoDownloader.tsx` | Adicionar download direto via Baileys antes da edge function |

## Detalhes tecnicos

### useFileUpload.ts - Nova logica

```text
1. Tentar upload no bucket 'whatsapp-media' (garantido no init.sql)
2. Se falhar com erro de bucket, tentar 'chat-attachments'
3. Se ambos falharem, mostrar erro
```

### MediaAutoDownloader.tsx - Nova logica

```text
1. Buscar configuracao do Baileys nas system_settings
2. Tentar download direto: GET {baileysUrl}/sessions/{session}/messages/{msgId}/media
3. Se obtiver o arquivo, fazer upload para storage local (whatsapp-media)
4. Se falhar, tentar via edge function (fallback original)
5. Se tudo falhar, mostrar botao "Tentar novamente"
```
