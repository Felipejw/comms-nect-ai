

# Corrigir Proteção Permanente do admin@admin.com

## Problema Identificado

A proteção no `ProfileTab.tsx` usa `profile?.email === "admin@admin.com"`, mas o email na **tabela profiles** foi alterado para `atilio.pi@hotmail.com`. Como a verificação compara com o email do profile (que é editável), a proteção foi **contornada**. Com a proteção desativada, alguém conseguiu alterar a senha novamente.

A senha já foi resetada para `123456` agora via `bootstrap-admin`.

## Plano

### 1. Corrigir email do admin na tabela profiles
Executar migração SQL para restaurar o email correto:
```sql
UPDATE profiles SET email = 'admin@admin.com' WHERE user_id = '33c631a4-a9c5-4623-85c2-eb7d604298df';
```

### 2. Usar `user?.email` (auth) em vez de `profile?.email` para a proteção
No `ProfileTab.tsx`, trocar a verificação de `profile?.email` para `user?.email`, que vem do `auth.users` e **não pode ser alterado** pelo frontend (a Edge Function `update-user-email` já bloqueia). Isso torna a proteção impossível de contornar.

Mudança:
```typescript
// Antes (contornável):
const isProtectedAdmin = profile?.email === "admin@admin.com";

// Depois (seguro):
const isProtectedAdmin = user?.email === "admin@admin.com";
```

### 3. Bloquear edição do nome do admin também
Impedir que o formulário de nome/telefone altere dados do admin protegido, para evitar futuras manipulações.

### Arquivos alterados
- Migração SQL para corrigir email na tabela profiles
- `src/components/configuracoes/ProfileTab.tsx` — trocar verificação para `user?.email`

