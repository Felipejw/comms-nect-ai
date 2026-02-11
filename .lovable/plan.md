

## Correcao de 4 Bugs: WhatsApp, Contatos e Permissoes

---

### Bug 1: Exclusao em massa de conversas nao funciona

**Causa raiz:** A politica de RLS na tabela `conversations` so permite DELETE para usuarios com role `admin` ou `manager` (via `is_admin_or_manager(auth.uid())`). Quando um operador tenta excluir, o banco simplesmente ignora o DELETE sem retornar erro, e as conversas permanecem.

**Correcao:**
- No componente `Atendimento.tsx`, verificar a role do usuario antes de mostrar a opcao de exclusao em massa
- Adicionar `useAuth()` e verificar `isAdmin` ou `hasPermission('atendimento', 'edit')` 
- Desabilitar botoes de excluir para usuarios sem permissao
- Exibir toast informativo caso tente excluir sem permissao

---

### Bug 2: Grupos nao aparecem na aba "Grupos"

**Causa raiz:** O webhook do Baileys (`baileys-webhook/index.ts`, linha 314-320) descarta **todas** as mensagens de grupo com um `return` imediato:
```
if (rawFrom.endsWith("@g.us")) {
  console.log("Skipping group message");
  return ...
}
```
Alem disso, ao criar contatos, o campo `is_group` nunca e setado como `true`. Resultado: nenhum contato no banco tem `is_group = true`, e a aba Grupos fica sempre vazia.

**Correcao:**
- Remover o skip de mensagens de grupo no webhook
- Detectar se o `rawFrom` termina com `@g.us` e setar `is_group = true` ao criar o contato
- Usar o nome do grupo vindo do `pushName` ou do payload
- Garantir que a conversa seja criada normalmente para grupos

---

### Bug 3: Contatos nao mostram numero ou nome

**Causa raiz:** A maioria dos contatos no banco nao tem `phone` (e null) e so tem `whatsapp_lid`. A pagina de Contatos (`Contatos.tsx`) mostra o `contact.name` diretamente (que muitas vezes e um pushName repetido como "Gatteflow | Sistema de Vendas Online") e mostra "Pendente" para o telefone.

O problema e que a pagina Contatos **nao usa** o hook centralizado `useContactDisplayName` que ja existe e trata esses casos corretamente. O hook mostra telefone formatado quando disponivel, e trata pushNames e LIDs de forma inteligente.

**Correcao:**
- Importar e usar `getContactDisplayName` e `formatPhoneForDisplay` do hook `useContactDisplayName` na pagina Contatos
- Na coluna "Contato" da tabela, usar `getContactDisplayName(contact)` em vez de `contact.name` direto
- Para contatos sem telefone real, mostrar o LID parcial como referencia em vez de apenas "Pendente"
- Garantir que o `whatsapp_lid` esteja disponivel na interface `Contact` (ja esta)

---

### Bug 4: Atendentes nao obedecem permissoes

**Causa raiz:** A pagina `Atendimento.tsx` nao verifica permissoes do usuario em nenhum momento. Diferente de outras paginas (Tags, Kanban, Campanhas, Contatos) que usam `hasPermission` e `canEdit`, o Atendimento permite que qualquer usuario logado faca qualquer acao -- excluir conversas, transferir, alterar status, usar acoes em massa, etc.

A sidebar ja filtra os links baseado em permissoes, e o `ProtectedRoute` bloqueia o acesso a pagina inteira. Mas dentro da pagina, nao ha granularidade.

**Correcao:**
- Adicionar `useAuth()` com `hasPermission` e `isAdmin` no componente Atendimento
- Criar variavel `canEdit = isAdmin || hasPermission('atendimento', 'edit')`
- Desabilitar botoes de: excluir conversa, excluir em massa, alterar status, transferir atendente, transferir setor, transferir para bot
- Manter funcoes de leitura (ver conversas, ler mensagens, buscar) acessiveis para todos com `can_view`
- Adicionar `ReadOnlyBadge` quando o usuario nao tem permissao de edicao

---

### Secao tecnica

**Arquivos modificados:**

1. `supabase/functions/baileys-webhook/index.ts`
   - Remover o bloco de skip de grupos (linhas 314-320)
   - Adicionar deteccao de `@g.us` para setar `is_group: true` na criacao de contatos
   - Ajustar a logica de busca/criacao de contatos para incluir grupos

2. `src/pages/Contatos.tsx`
   - Importar `getContactDisplayName` de `useContactDisplayName`
   - Substituir `contact.name` por `getContactDisplayName(contact)` na coluna de contato da tabela (linha 738)
   - Melhorar exibicao para contatos sem telefone

3. `src/pages/Atendimento.tsx`
   - Importar `useAuth` e `ReadOnlyBadge`
   - Adicionar verificacao `canEdit` em ~15 pontos de acao (botoes de excluir, transferir, alterar status, acoes em massa)
   - Adicionar `ReadOnlyBadge` no header quando sem permissao de edicao

**Fluxo de permissoes resultante:**
- Admin: acesso total a tudo
- Manager: acesso total (via `is_admin_or_manager`)
- Operator com `can_view` + `can_edit`: pode ver e editar
- Operator com apenas `can_view`: pode ver conversas e enviar mensagens, mas nao pode excluir, transferir ou alterar status
- Operator sem permissao no modulo: nao acessa a pagina (bloqueado pelo ProtectedRoute)

