

# Corrigir Proteção do admin@admin.com

## Problema Identificado

As proteções anteriores bloquearam apenas as Edge Functions (`reset-user-password` e `update-user-email`), mas a tela de **Perfil** (`ProfileTab.tsx`) permite que o próprio usuário logado altere sua senha e email diretamente via `supabase.auth.updateUser()` -- sem passar pelas Edge Functions protegidas. Foi assim que alguém logou como admin e trocou a senha.

## Plano

### 1. Resetar a senha do admin via bootstrap-admin
Chamar a Edge Function `bootstrap-admin` para restaurar a senha de `admin@admin.com` para `123456`.

### 2. Bloquear alterações na ProfileTab para admin@admin.com
No `ProfileTab.tsx`, adicionar verificação: se o usuário logado for `admin@admin.com`, esconder os formulários de "Alterar Email" e "Alterar Senha", impedindo qualquer alteração pelo lado do cliente.

### Arquivos alterados
- `src/components/configuracoes/ProfileTab.tsx` -- esconder seções de email e senha quando o usuário logado for `admin@admin.com`

