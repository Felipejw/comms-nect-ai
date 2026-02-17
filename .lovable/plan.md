

# Correcoes: Erro de Bucket + Audio Visual + Script de Update

## Problema 1: "Bucket not found" ao enviar audio

**Causa raiz**: O bucket `chat-attachments` deveria ser criado pelo `init.sql` na instalacao, mas o bloco de criacao de buckets pode ter falhado silenciosamente (as policies sao criadas com `CREATE POLICY` sem `IF NOT EXISTS`, causando erro se executado mais de uma vez). O `useFileUpload` tenta o bucket primario, falha, tenta criar via `admin-write`, e como a edge function roda no Lovable Cloud (nao no VPS local), o bucket e criado no lugar errado.

**Solucao**: Mudar o `useFileUpload` para tentar o `whatsapp-media` como primeira opcao (este bucket tem mais chance de existir no VPS por ser usado pelo webhook). Tambem adicionar ao script de update um comando para garantir que os buckets existam.

## Problema 2: Audio nao carrega / visual ruim

**Causa raiz**: No print, o audio aparece como "[Audio]" com botao "Tentar novamente" — isso significa que o `MediaAutoDownloader` falhou em baixar a midia. O audio recebido do WhatsApp nao teve sua midia processada pelo webhook. Alem disso, quando o usuario envia audio do sistema, o upload falha (problema 1), entao nao existe URL para o player renderizar.

**Solucao**: Melhorar o visual do estado de erro do `MediaAutoDownloader` e do `AudioPlayer` para ficarem mais limpos e bonitos, estilo WhatsApp.

## Problema 3: Script de update incompleto

**Causa raiz**: O `update.sh` faz git pull, rebuild do frontend, e reinicia containers — mas NAO garante que os buckets de storage existam nem executa o init.sql para corrigir configuracoes faltantes.

**Solucao**: Adicionar ao script de update um passo que garante a existencia dos buckets via SQL.

---

## Detalhes Tecnicos

### Arquivo 1: `src/hooks/useFileUpload.ts`

- Inverter a prioridade: tentar `whatsapp-media` primeiro (que e criado pelo webhook e pelo init.sql com mais robustez)
- Manter `chat-attachments` como fallback
- Melhorar o caminho do upload para incluir subpasta por tipo (audio, image, etc.)

### Arquivo 2: `src/components/atendimento/MediaAutoDownloader.tsx`

- Melhorar o visual do estado de erro para ficar mais limpo
- Mostrar um placeholder bonito em vez de texto generico
- Adicionar icone contextual maior e mais visivel

### Arquivo 3: `src/components/atendimento/AudioPlayer.tsx`

- Melhorar o visual geral do player — bordas, cores, tamanho
- Ajustar o estado de erro para mostrar algo mais bonito
- Garantir que o player funcione corretamente quando nao ha URL

### Arquivo 4: `deploy/scripts/update.sh`

- Adicionar passo apos migrations para garantir que os buckets `chat-attachments` e `whatsapp-media` existam no storage
- Executar SQL que cria os buckets se nao existirem
- Adicionar verificacao de saude do storage

### Resumo de alteracoes

| Arquivo | Acao |
|---------|------|
| `src/hooks/useFileUpload.ts` | Inverter prioridade de buckets |
| `src/components/atendimento/MediaAutoDownloader.tsx` | Melhorar visual de erro |
| `src/components/atendimento/AudioPlayer.tsx` | Melhorar visual geral |
| `deploy/scripts/update.sh` | Adicionar criacao de buckets no update |

