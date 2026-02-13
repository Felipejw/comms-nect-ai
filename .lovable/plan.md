

# Correção: "Bucket not found" ao enviar arquivos na VPS

## Problema

Ao enviar audio, video ou imagem no Atendimento, o erro "Bucket not found" aparece porque o bucket `chat-attachments` nao existe no Supabase da VPS. O script `init.sql` tenta cria-lo, mas pode ter falhado silenciosamente durante a instalacao.

## Solucao

Duas frentes: correcao imediata via codigo e prevencao futura.

### 1. Edge Function para garantir que o bucket existe

Criar uma logica na Edge Function `admin-write` (que ja usa `service_role`) para aceitar uma operacao `ensure-bucket` que cria o bucket se nao existir. Isso sera chamado antes do upload.

### 2. Hook useFileUpload resiliente

Modificar `src/hooks/useFileUpload.ts` para:
- Antes de fazer upload, tentar um `list` no bucket para verificar se existe
- Se receber erro "Bucket not found", chamar a Edge Function para criar o bucket e as policies
- Depois, prosseguir com o upload normalmente
- Isso acontece apenas na primeira vez; depois o bucket ja existe

### 3. Fallback no init.sql (prevencao)

Adicionar ao script `deploy/supabase/init.sql` um bloco mais robusto com `EXCEPTION` handler para garantir que falhas na criacao de buckets sejam logadas.

---

## Detalhes Tecnicos

**Arquivo: `src/hooks/useFileUpload.ts`**

Adicionar logica de retry com criacao automatica do bucket:

```text
mutationFn: async (file: File) => {
  // Tentar upload
  // Se erro "Bucket not found":
  //   -> Chamar edge function admin-write com operacao ensure-bucket
  //   -> Retentar upload
}
```

**Arquivo: `supabase/functions/admin-write/index.ts`**

Adicionar handler para operacao `ensure-bucket`:

```text
if (operation === 'ensure-bucket') {
  // Criar bucket com service_role se nao existir
  // Criar policies de storage
}
```

**Arquivo: `deploy/supabase/init.sql`**

Tornar o bloco de criacao de buckets mais robusto com tratamento de excecoes explicito.

### Resultado

- Na primeira vez que o usuario enviar um arquivo na VPS, o sistema cria o bucket automaticamente
- Uploads subsequentes funcionam normalmente sem overhead extra
- Nenhuma acao manual necessaria do usuario

