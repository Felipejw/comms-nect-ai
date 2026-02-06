

# Correcao Definitiva: Volume Mount do PostgreSQL

## Causa Raiz

A linha 66 do `deploy/docker-compose.yml` monta um diretorio local SUBSTITUINDO o diretorio `/docker-entrypoint-initdb.d/` inteiro dentro do container PostgreSQL:

```text
volumes:
  - ./volumes/db/init:/docker-entrypoint-initdb.d:Z   <-- PROBLEMA
```

A imagem `supabase/postgres:15.1.1.78` contem scripts internos nesse diretorio que criam roles essenciais como `supabase_auth_admin`, `authenticator`, `supabase_storage_admin`, etc. Ao sobrescrever o diretorio inteiro com apenas o nosso `init.sql`, esses roles nunca sao criados. O GoTrue tenta conectar como `supabase_auth_admin`, falha, e o container fica "unhealthy".

## Solucao

Montar nosso `init.sql` como um **arquivo unico** dentro do diretorio, em vez de substituir o diretorio inteiro. Usar o prefixo `99-` para garantir que rode DEPOIS dos scripts internos do Supabase.

---

## Alteracoes

### Arquivo 1: `deploy/docker-compose.yml`

Trocar o volume mount do diretorio por um mount de arquivo:

**Antes:**
```text
volumes:
  - ./volumes/db/data:/var/lib/postgresql/data:Z
  - ./volumes/db/init:/docker-entrypoint-initdb.d:Z
```

**Depois:**
```text
volumes:
  - ./volumes/db/data:/var/lib/postgresql/data:Z
  - ./volumes/db/init/init.sql:/docker-entrypoint-initdb.d/99-custom-init.sql:ro
```

Isso preserva todos os scripts internos da imagem Supabase e adiciona o nosso como o ultimo a rodar.

### Arquivo 2: `deploy/scripts/install-unified.sh`

Na funcao `create_directories()`, garantir que o arquivo `init.sql` exista no caminho correto antes do Docker Compose tentar monta-lo (Docker exige que o arquivo exista para mount de arquivo unico):

```text
# Garantir que init.sql existe no caminho correto
mkdir -p "$DEPLOY_DIR/volumes/db/init"
if [ -f "$DEPLOY_DIR/supabase/init.sql" ]; then
    cp "$DEPLOY_DIR/supabase/init.sql" "$DEPLOY_DIR/volumes/db/init/init.sql"
fi

# Criar arquivo vazio se não existir (evita erro de mount)
touch "$DEPLOY_DIR/volumes/db/init/init.sql"
```

### Arquivo 3: `deploy/supabase/init.sql`

Adicionar `IF NOT EXISTS` em todos os CREATE para evitar conflitos caso o Supabase ja tenha criado algum objeto (o nosso script roda por ultimo):

- `CREATE TYPE` passa a usar checagem previa
- `CREATE TABLE` passa a usar `IF NOT EXISTS`
- `CREATE FUNCTION` passa a usar `CREATE OR REPLACE`

---

## Fluxo de Inicializacao Corrigido

```text
1. Docker Compose inicia o container PostgreSQL
2. PostgreSQL detecta que /var/lib/postgresql/data esta vazio
3. Roda os scripts internos da imagem Supabase:
   - Cria roles: supabase_auth_admin, authenticator, supabase_storage_admin, etc.
   - Configura schemas internos: auth, storage, realtime
   - Define permissoes
4. Roda nosso script 99-custom-init.sql (por ultimo):
   - Cria ENUMs, funcoes, tabelas da aplicacao
   - Cria RLS policies
   - Tudo com IF NOT EXISTS para seguranca
5. GoTrue conecta como supabase_auth_admin -> SUCESSO
6. Kong inicia apos auth ficar healthy
7. Instalacao continua normalmente
```

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `deploy/docker-compose.yml` | Trocar mount de diretorio por mount de arquivo unico |
| `deploy/scripts/install-unified.sh` | Ajustar copia do init.sql e criar arquivo se nao existir |
| `deploy/supabase/init.sql` | Adicionar IF NOT EXISTS em todos os CREATE |

Esta e a correcao definitiva. Todas as tentativas anteriores falharam porque os roles internos do Supabase nunca eram criados.

