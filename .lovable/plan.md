
# Adicionar Botao de Sair (Logout)

## Problema
Atualmente, nao existe um botao funcional de "Sair" acessivel na interface. O `AppHeader` tem um dropdown com a opcao "Sair", mas esse header nao esta sendo usado no layout atual (`AppLayout` renderiza apenas `AppSidebar` + `Outlet`). O sidebar nao tem opcao de logout.

## Solucao
Adicionar um botao de "Sair" funcional no rodape do sidebar (`AppSidebar`), ao lado do link de "Configuracoes", que chama a funcao `signOut` do `AuthContext` e redireciona para a pagina de login.

## O que sera feito

### 1. Atualizar o AppSidebar
- Importar `useNavigate` do react-router-dom
- Importar o icone `LogOut` do lucide-react  
- Usar `signOut` e `profile` do `useAuth()`
- Adicionar no rodape do sidebar (abaixo de "Configuracoes"):
  - Exibicao do nome/email do usuario logado (quando nao colapsado)
  - Botao "Sair" com icone `LogOut` que executa `signOut()` e navega para `/login`

### 2. Resultado visual
O rodape do sidebar ficara assim:

```text
+----------------------------+
| [Avatar] Nome do Usuario   |
|           email@email.com  |
+----------------------------+
| [Gear]   Configuracoes     |
| [LogOut] Sair              |
+----------------------------+
```

Quando colapsado, mostrara apenas os icones.

## Detalhes tecnicos

- Arquivo modificado: `src/components/layout/AppSidebar.tsx`
- Usa `signOut` do `useAuth()` (ja existente no `AuthContext`)
- Usa `useNavigate` para redirecionar apos logout
- Exibe `profile?.name` e `profile?.email` do contexto de autenticacao
- Tratamento de erro com `toast.error` caso o logout falhe
- Compativel com sidebar colapsado (mostra apenas icones)
- Compativel com mobile (fecha o sheet apos clicar)
