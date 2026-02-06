
# Correcao: ID Errado em Todas as Acoes da Pagina de Usuarios

## Causa Raiz

A pagina `Usuarios.tsx` usa `user.id` em todas as acoes (excluir, trocar nivel, editar, redefinir senha, permissoes). Porem, `user.id` e a chave primaria da tabela `profiles` (um UUID interno), enquanto todas as operacoes precisam do `user.user_id` (o UUID do usuario no Auth).

Resultado:
- **Excluir**: A funcao `delete-user` recebe um ID que nao existe no Auth, retorna sucesso (porque agora ignora erros de Auth), mas nao deleta o perfil porque o `user_id` nao bate
- **Trocar nivel**: O `useUpdateUserRole` faz `.eq('user_id', userId)` na tabela `user_roles`, mas recebe o `id` do perfil, que nao corresponde a nenhum registro

## Correcao

Trocar todas as referencias de `user.id` para `user.user_id` nas chamadas de acao na pagina `Usuarios.tsx`.

---

## Detalhes Tecnicos

### Arquivo: `src/pages/Usuarios.tsx`

**7 pontos de correcao** (todos na renderizacao da tabela, linhas 486-540):

| Linha | Antes | Depois |
|-------|-------|--------|
| 486 | `handleRoleChange(user.id, ...)` | `handleRoleChange(user.user_id, ...)` |
| 526 | `handleOpenPermissions(user.id, ...)` | `handleOpenPermissions(user.user_id, ...)` |
| 531 | `handleOpenEdit({ id: user.id, ... })` | `handleOpenEdit({ id: user.user_id, ... })` |
| 535 | `handleOpenResetPassword(user.id, ...)` | `handleOpenResetPassword(user.user_id, ...)` |
| 539 | `handleOpenDelete({ id: user.id, ... })` | `handleOpenDelete({ id: user.user_id, ... })` |

A chave do `TableRow` pode continuar sendo `user.id` (e valido para fins de renderizacao React).

Nenhuma alteracao em hooks ou edge functions e necessaria -- o problema esta apenas no ID passado pela pagina.
