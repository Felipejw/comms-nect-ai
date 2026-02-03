

# Plano: Corrigir Erro de Inicializacao do PostgreSQL

## Problema Identificado

O arquivo `deploy/supabase/init.sql` tenta criar extensoes que nao existem na imagem Docker padrao do PostgreSQL:

```sql
-- Linha 9: Esta extensao so existe no Supabase Cloud
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
```

O erro exato:
```
psql:/docker-entrypoint-initdb.d/init.sql:9: ERROR:  schema "graphql" does not exist
```

---

## Solucao

Vou corrigir o `init.sql` para:
1. Remover extensoes que nao existem na versao self-hosted
2. Criar schemas necessarios antes de criar extensoes
3. Usar apenas extensoes compativeis com PostgreSQL padrao

---

## Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `deploy/supabase/init.sql` | Modificar | Remover pg_graphql e corrigir extensoes |

---

## Alteracao no init.sql

**Antes (problematico):**
```sql
-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
```

**Depois (corrigido):**
```sql
-- Criar schemas necessarios primeiro
CREATE SCHEMA IF NOT EXISTS extensions;

-- Extensoes necessarias (compativeis com PostgreSQL padrao)
-- NOTA: pg_graphql nao esta disponivel em self-hosted, removido
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
```

---

## Apos Implementar

Voce precisara:

1. **Limpar dados corrompidos do banco:**
```bash
sudo rm -rf /opt/sistema/deploy/volumes/db/data/*
```

2. **Reiniciar a instalacao:**
```bash
cd /opt/sistema/deploy
sudo docker compose down
sudo docker compose --profile baileys up -d
```

---

## Secao Tecnica

### Por que pg_graphql nao funciona?

A extensao `pg_graphql` e uma extensao proprietaria do Supabase que:
- Nao esta incluida na imagem `supabase/postgres:15.1.1.78`
- Requer compilacao especifica
- E usada apenas para a API GraphQL (que nao estamos usando neste projeto)

### Extensoes Disponiveis no Self-Hosted

As seguintes extensoes funcionam normalmente:
- `pgcrypto` - Funcoes criptograficas
- `uuid-ossp` - Geracao de UUIDs
- `pg_stat_statements` - Estatisticas de queries

