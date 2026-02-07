
# Solucao Definitiva: Corrigir Saves no VPS

## O que esta acontecendo (explicacao simples)

As mudancas que foram feitas ate agora so afetaram o Lovable Cloud (ambiente de teste). O seu VPS em `chatbotvital.store` tem um banco de dados SEPARADO que ainda esta com as regras antigas. Essas regras exigem um "tenant_id" (identificador de empresa) que nao existe mais no codigo -- por isso o banco rejeita tudo.

A prova esta na sua tela: o menu "Super Admin" ainda aparece, significando que o VPS roda o codigo antigo.

## Duas acoes necessarias no VPS

### Acao 1: Rodar o SQL de migracao no banco do VPS

Um unico comando que vai:
- Remover TODAS as politicas de seguranca antigas (que checam tenant_id)
- Criar politicas novas e simples (apenas checa se esta logado)
- Remover a coluna tenant_id de todas as tabelas
- Remover tabelas de tenant que nao existem mais
- Adicionar a UNIQUE constraint em system_settings

### Acao 2: Reconstruir o Docker

Reconstruir o container para que o VPS use o codigo novo (sem tenant, sem Super Admin, com saves corrigidos).

## Mudancas no codigo (resiliencia extra)

### 1. useSystemSettings.ts - Parar de usar upsert

O `upsert` exige uma constraint UNIQUE no banco. Se ela nao existe (caso de bancos antigos), falha. A solucao eh usar SELECT primeiro, depois INSERT ou UPDATE conforme o caso:

```typescript
// ANTES (depende de UNIQUE constraint):
const { error } = await supabase
  .from("system_settings")
  .upsert({ key, value }, { onConflict: "key" });

// DEPOIS (funciona com qualquer banco):
const { data: existing } = await supabase
  .from("system_settings")
  .select("id")
  .eq("key", key)
  .maybeSingle();

if (existing) {
  await supabase.from("system_settings")
    .update({ value, description, category })
    .eq("key", key);
} else {
  await supabase.from("system_settings")
    .insert({ key, value, description, category });
}
```

Tambem corrigir o `updateSetting` para que funcione quando a chave ainda nao existe.

### 2. CustomizeTab.tsx - Mesmo padrao

Substituir todos os `.upsert()` diretos por SELECT + INSERT/UPDATE. Sao usados em:
- Upload de logo
- Remocao de logo
- Salvar cores de identidade visual (11 configuracoes)

### 3. BaileysConfigSection.tsx - Ja usa createOrUpdateSetting

Esse arquivo ja chama `createOrUpdateSetting` do hook, entao a correcao no hook resolve automaticamente.

## Arquivos que serao modificados

| Arquivo | O que muda |
|---------|-----------|
| src/hooks/useSystemSettings.ts | SELECT + INSERT/UPDATE em vez de upsert |
| src/components/configuracoes/CustomizeTab.tsx | SELECT + INSERT/UPDATE em vez de upsert direto |

## Script SQL completo para o VPS

Sera fornecido um comando unico para colar no terminal do VPS que faz toda a migracao do banco. O script:
1. Remove todas as RLS policies existentes (loop automatico)
2. Remove coluna tenant_id de todas as tabelas
3. Remove tabelas e funcoes de tenant
4. Recria todas as RLS policies simples (sem tenant_id)
5. Adiciona UNIQUE constraint em system_settings

## Instrucoes para o usuario

Depois de aprovado o plano, serao fornecidas:
1. As mudancas no codigo (automaticas pelo Lovable)
2. O script SQL completo para colar no terminal do VPS
3. O comando docker para reconstruir

## Resultado final

- Salvar configuracoes do Baileys funciona
- Salvar identidade visual funciona
- Alterar opcoes do sistema funciona
- Funciona mesmo se o banco nao tiver UNIQUE constraint
- Funciona mesmo se o banco ainda tiver coluna tenant_id
