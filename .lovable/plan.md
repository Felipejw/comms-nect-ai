

# Correção: Permissões de Tabela para Role `authenticated`

## Causa Raiz Identificada

O problema NÃO é nas RLS policies (estão corretas) e NÃO é no CORS. O problema é que o role PostgreSQL `authenticated` (usado para todas as operações de usuários logados) **só tem permissão de SELECT** nas tabelas.

Em uma instalação Supabase self-hosted, o PostgreSQL precisa que o role `authenticated` tenha permissões de INSERT, UPDATE e DELETE nas tabelas para que as operações de escrita funcionem. No ambiente Cloud, isso é configurado automaticamente. Na instalação self-hosted, a configuração está incompleta.

### Evidência

No arquivo `deploy/scripts/install-unified.sh`, linha 762:
```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO authenticated, anon;
```

Isso concede **apenas SELECT**. O `deploy/supabase/init.sql` NÃO contém nenhum `GRANT` para o role `authenticated`. Resultado: todas as tabelas criadas pelo init.sql ficam com permissão apenas de leitura para usuários autenticados.

### Por que SELECT funciona mas INSERT/UPDATE não

- O login funciona porque o serviço de autenticação opera diretamente no banco, sem passar pelas permissões de role
- Visualizar dados funciona porque SELECT está liberado
- Criar/salvar falha porque INSERT/UPDATE/DELETE NÃO estão liberados para o role `authenticated`

## Correção Imediata (rodar agora no servidor)

Execute este comando no terminal da VPS para corrigir imediatamente:

```bash
sudo docker exec supabase-db psql -U postgres -c "
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon;
"
```

Apos executar, tente criar um contato ou fluxo novamente. Deve funcionar imediatamente, sem reiniciar nenhum container.

## Correção Permanente (no codigo)

Para garantir que instalacoes futuras e atualizacoes nunca tenham esse problema, sera adicionada uma seção de GRANTS ao final do `init.sql` e corrigido o fallback do `install-unified.sh`.

### Arquivo 1: `deploy/supabase/init.sql`

Adicionar uma nova PARTE entre as policies (PARTE 7) e o storage (PARTE 8) com os grants necessarios:

```sql
-- PARTE 7.5: GRANTS para roles de autenticação
-- Garante que authenticated pode fazer CRUD completo
-- e anon pode apenas ler dados publicos

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres 
  IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres 
  IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres 
  IN SCHEMA public GRANT SELECT ON TABLES TO anon;
```

### Arquivo 2: `deploy/scripts/install-unified.sh`

Corrigir a linha 762 do fallback para conceder ALL em vez de apenas SELECT:

De:
```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO authenticated, anon;
```

Para:
```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO anon;
```

### Arquivo 3: Melhorar mensagens de erro nos hooks

Atualizar o `useFlows.ts` para exibir mensagem de erro detalhada (como ja foi feito em outros hooks):

```typescript
// De:
onError: () => {
  toast.error("Erro ao criar fluxo");
}

// Para:
onError: (error: Error) => {
  toast.error("Erro ao criar fluxo: " + error.message);
}
```

Aplicar o mesmo padrao em todos os handlers `onError` do `useFlows.ts`.

## Resumo das alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `deploy/supabase/init.sql` | Adicionar secao de GRANTS apos as policies RLS |
| `deploy/scripts/install-unified.sh` | Corrigir fallback de grants (SELECT -> ALL) |
| `src/hooks/useFlows.ts` | Mensagens de erro detalhadas em todos os handlers |

## Apos implementar e fazer deploy

```bash
cd /opt/sistema && git pull origin main
# O comando SQL acima ja corrige o banco existente.
# O init.sql corrigido so toma efeito em novas instalações.
```

