
# Corrigir Carregamento Infinito em Todas as Telas (VPS)

## Causa Raiz

O problema esta em dois pontos criticos:

### 1. ProtectedRoute trava quando role e null
Em `src/components/auth/ProtectedRoute.tsx` (linha 32-38), quando o `loading` termina mas o `role` e `null` (porque a query de `user_roles` falhou ou retornou vazio), o componente mostra um spinner eternamente:

```text
ProtectedRoute:
  loading = false  -->  OK, prossegue
  user = existe     -->  OK, prossegue  
  role = null       -->  SPINNER ETERNO (nao tem timeout nem fallback)
```

Isso acontece se:
- A tabela `user_roles` nao tem o registro do admin
- O GoTrue criou o usuario mas o trigger `handle_new_user` falhou parcialmente
- A INSERT do role `admin` no script de instalacao nao executou

### 2. system_settings so permite leitura para admins
A politica RLS da tabela `system_settings` e:
```text
"Admins can manage system settings" FOR ALL USING (is_admin_or_manager(...))
```

Isso significa que so admins podem LER a tabela. Mas o `BrandingProvider` (que roda para TODOS os usuarios) e o sidebar (que mostra o nome da plataforma) precisam ler essas configuracoes. Se o role nao foi carregado corretamente, a query falha silenciosamente.

## Mudancas Planejadas

### Arquivo 1: `src/components/auth/ProtectedRoute.tsx`
- Quando `loading` e `false` e `role` e `null`, mostrar uma tela de erro com:
  - Mensagem clara: "Nao foi possivel carregar suas permissoes"
  - Botao "Tentar novamente" (chama `refreshUserData`)
  - Botao "Sair" (faz logout)
- Isso substitui o spinner eterno por uma acao do usuario

### Arquivo 2: `src/contexts/AuthContext.tsx`
- No `fetchUserData`, quando `user_roles` retorna null (nenhum registro), definir role como `operator` como fallback em vez de deixar null
- Isso garante que o usuario sempre tenha um role definido apos o loading

### Arquivo 3: `deploy/supabase/init.sql`
- Adicionar uma politica SELECT separada para `system_settings` que permita leitura para TODOS os usuarios autenticados:
  ```text
  "Authenticated users can view system settings" FOR SELECT USING (auth.uid() IS NOT NULL)
  ```
- Manter a politica existente de ALL para admins (gerenciamento)
- Isso permite que o BrandingProvider e o sidebar funcionem para qualquer usuario logado

### Arquivo 4: Migracao no banco Lovable Cloud
- Aplicar a mesma politica de SELECT para system_settings no banco Cloud via migracao SQL

## Resumo das Mudancas

| Arquivo | Mudanca |
|---------|---------|
| `src/components/auth/ProtectedRoute.tsx` | Tela de erro em vez de spinner eterno quando role e null |
| `src/contexts/AuthContext.tsx` | Fallback para `operator` quando user_roles retorna vazio |
| `deploy/supabase/init.sql` | Politica SELECT em system_settings para todos os autenticados |
| Migracao SQL | Aplicar politica no banco Cloud |

## Apos Aprovacao

Voce precisara atualizar a VPS:
1. `cd /opt/sistema && sudo git pull`
2. Rodar no banco da VPS:
```text
sudo docker exec supabase-db psql -U postgres -c "
  CREATE POLICY \"Authenticated users can view system settings\"
  ON public.system_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);
"
```
3. Reiniciar: `sudo docker compose --profile baileys restart`

## Secao Tecnica

### Fluxo corrigido do ProtectedRoute

```text
ProtectedRoute
  |
  +-- loading = true?  --> Spinner (normal)
  |
  +-- user = null?     --> Redirect /login
  |
  +-- role = null?     --> TELA DE ERRO (antes: spinner eterno)
  |                        [Tentar novamente] [Sair]
  |
  +-- isAdmin?         --> Renderizar children
  |
  +-- hasPermission?   --> Renderizar children ou Redirect /acesso-negado
```

### Por que o fallback para operator?

Se um usuario consegue logar mas nao tem nenhum registro em `user_roles`, e mais seguro trata-lo como `operator` (menor nivel de permissao) do que deixar o sistema travado. O admin pode depois ajustar o role pela interface de Atendentes.
