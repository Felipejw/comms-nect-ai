

# Correcao: Novo Atendente Vendo "Acesso Negado" ao Logar

## Causa Raiz

Quando um atendente e criado, as permissoes padrao sao todas `can_view: false` e `can_edit: false`. Isso significa que o atendente nao tem permissao para ver nenhuma pagina, incluindo o Dashboard.

Fluxo do problema:
1. Admin cria atendente sem alterar permissoes
2. Sistema salva todas as permissoes com `can_view: false`
3. Atendente faz login e e redirecionado para `/dashboard`
4. `ProtectedRoute` verifica `hasPermission('dashboard', 'view')` -> encontra permissao mas `can_view = false`
5. Redireciona para "Acesso Negado"

Alem disso, se um usuario operator nao tiver NENHUMA permissao no banco, o sistema tambem bloqueia (retorna `false` por padrao).

## Solucao

Duas correcoes:

### 1. Alterar permissoes padrao para permitir visualizacao
**Arquivo**: `src/components/usuarios/PermissionsPanel.tsx` (linha 101)

Mudar o valor padrao de `can_view` de `false` para `true`:

```text
defaultPerms[m.key] = { can_view: true, can_edit: false };
```

Assim, novos atendentes podem visualizar todas as paginas por padrao. O admin pode remover permissoes especificas se quiser restringir o acesso.

### 2. Permitir acesso quando nenhuma permissao esta configurada
**Arquivo**: `src/contexts/AuthContext.tsx` (funcao `hasPermission`, linhas 160-168)

Adicionar logica para que, quando nenhuma permissao estiver registrada no banco para um operator, o sistema permita o acesso (em vez de bloquear):

```text
const hasPermission = (module: string, action: 'view' | 'edit'): boolean => {
  if (isSuperAdmin || isAdmin) return true;
  
  // Se nao ha permissoes configuradas, permitir acesso por padrao
  if (permissions.length === 0) return true;
  
  const permission = permissions.find(p => p.module === module);
  if (!permission) return false;
  
  return action === 'view' ? permission.can_view : permission.can_edit;
};
```

Isso cobre o caso de usuarios criados por outros meios (ex: signup direto) que nao tem permissoes na tabela.

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/usuarios/PermissionsPanel.tsx` | Padrao de `can_view` muda de `false` para `true` |
| `src/contexts/AuthContext.tsx` | `hasPermission` permite acesso quando nenhuma permissao existe |

