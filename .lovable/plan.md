
# Corrigir Permissões de Escrita na VPS

## Problema Identificado

Todas as operações de **leitura** funcionam, mas **escritas** falham com erro de RLS. Isso indica que o role PostgreSQL `authenticated` (usado pelo PostgREST) nao tem permissao de escrita nas tabelas, mesmo que as politicas de RLS estejam corretas.

Os erros especificos:
- "new row violates row-level security policy for table system_settings" (ao salvar config do Baileys)
- Excluir contato nao funciona (mesma causa)

## Causa Raiz

O `init.sql` contem os GRANTs corretos (linhas 966-969), mas durante a instalacao eles podem nao ter sido aplicados corretamente. Sem `GRANT ALL` no role `authenticated`, o PostgREST nao consegue fazer INSERT, UPDATE ou DELETE - apenas SELECT.

## Solucao

**Nao ha mudancas de codigo necessarias.** O `init.sql` ja esta correto. O problema esta no banco de dados da VPS que precisa receber os GRANTs manualmente.

### Passo 1: Diagnostico (rode na VPS)

```text
sudo docker exec supabase-db psql -U postgres -c "
  SELECT 
    grantee, 
    table_name, 
    privilege_type
  FROM information_schema.table_privileges 
  WHERE table_schema = 'public' 
    AND table_name = 'system_settings'
  ORDER BY grantee, privilege_type;
"
```

Isso vai mostrar quais permissoes o role `authenticated` tem na tabela `system_settings`. Se nao aparecer INSERT, UPDATE, DELETE - confirma o problema.

### Passo 2: Verificar role do usuario admin

```text
sudo docker exec supabase-db psql -U postgres -c "
  SELECT p.email, ur.role 
  FROM user_roles ur 
  JOIN profiles p ON p.user_id = ur.user_id;
"
```

Isso confirma se o usuario tem o role `admin` no banco de dados.

### Passo 3: Aplicar a correcao

```text
sudo docker exec supabase-db psql -U postgres -c "
  -- Permissoes completas para authenticated
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  
  -- Permissoes para service_role
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
  
  -- Permissao de leitura para anon
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  
  -- Garantir permissoes futuras
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
    GRANT ALL ON TABLES TO authenticated, service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
    GRANT ALL ON SEQUENCES TO authenticated, service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
    GRANT SELECT ON TABLES TO anon;
"
```

### Passo 4: Reiniciar PostgREST

```text
cd /opt/sistema/deploy
sudo docker restart supabase-rest
```

### Passo 5: Testar

Apos reiniciar, tente:
1. Salvar as configuracoes do Baileys na tela de Configuracoes > Opcoes
2. Excluir o contato "Teste"

Ambas as operacoes devem funcionar sem erro de RLS.

## Por que isso acontece

Em instalacoes self-hosted do Supabase, o PostgreSQL tem dois niveis de controle de acesso:

```text
Nivel 1: GRANTs (permissao do role PostgreSQL)
  authenticated PRECISA de GRANT ALL para poder escrever

Nivel 2: RLS Policies (controle fino por registro)
  is_admin_or_manager() verifica se o usuario e admin

Ambos precisam permitir a operacao para ela funcionar.
```

Se o GRANT nao existe, a operacao falha no Nivel 1 antes mesmo de chegar ao Nivel 2 (RLS). O erro reportado menciona "RLS" mas a causa real e a falta de GRANT.
