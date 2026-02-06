

## Fix Definitivo: Roles sem Senha + Senha Admin 123456

### O que estava errado

O problema nunca foi uma "race condition" ou timing. A imagem `supabase/postgres:15.1.1.78` cria as roles internas (`supabase_auth_admin`, `supabase_storage_admin`, `authenticator`) **SEM SENHA** durante a inicializacao. O setup oficial do Supabase exige um arquivo chamado `roles.sql` montado em `/docker-entrypoint-initdb.d/init-scripts/99-roles.sql` que define as senhas dessas roles. Nos nunca montamos esse arquivo. Por isso, o servico de autenticacao (GoTrue) nunca conseguiu conectar ao banco e sempre retornou erro HTML em vez de JSON.

### O que sera feito

1. Criar um arquivo `roles.sql` durante a instalacao que define as senhas das roles internas
2. Montar esse arquivo no local correto dentro do container PostgreSQL
3. Definir a senha do admin como `123456` (fixa)
4. Atualizar o `repair-auth.sh` para tambem corrigir instalacoes existentes

---

### Detalhes tecnicos

#### Arquivo 1: `deploy/docker-compose.yml`

Adicionar volume mount para `roles.sql` no servico `db`:

```yaml
volumes:
  - ./volumes/db/data:/var/lib/postgresql/data:Z
  - ./volumes/db/init/init.sql:/docker-entrypoint-initdb.d/migrations/init.sql:ro
  - ./volumes/db/init/99-sync-passwords.sh:/docker-entrypoint-initdb.d/99-sync-passwords.sh:ro
  - ./volumes/db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro
```

O arquivo `99-sync-passwords.sh` sera mantido como fallback redundante.

#### Arquivo 2: `deploy/scripts/install-unified.sh`

**Mudanca A** - Senha do admin fixa como `123456`:
```bash
ADMIN_EMAIL="admin@admin.com"
ADMIN_PASSWORD="123456"
```

**Mudanca B** - Gerar `roles.sql` em `create_directories()` (seguindo o padrao oficial do Supabase):
```sql
-- roles.sql: Set passwords for internal Supabase roles
-- This file follows the official Supabase self-hosted pattern
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
```

Este arquivo usa `\set pgpass` para ler a variavel de ambiente `POSTGRES_PASSWORD` de dentro do container PostgreSQL, garantindo que as senhas SEMPRE correspondam.

#### Arquivo 3: `deploy/scripts/repair-auth.sh`

Atualizar para:
- Usar senha fixa `123456` ao criar o admin
- Gerar o `roles.sql` se nao existir
- Reiniciar o container DB (nao apenas o Auth) para que o `roles.sql` seja processado em reinstalacoes

---

### Por que as tentativas anteriores falharam

Todas as tentativas anteriores usavam `ALTER ROLE` DEPOIS que o PostgreSQL ja tinha iniciado. Mas o Supabase postgres image processa o subdiretorio `init-scripts/` durante uma fase especifica da inicializacao. Nosso `99-sync-passwords.sh` no diretorio raiz executava no momento errado ou era ignorado.

O arquivo `roles.sql` montado em `init-scripts/` segue exatamente o padrao oficial e roda na fase correta.

---

### Como executar

Para a instalacao atual (sem reinstalar):
```bash
cd /opt/sistema && git pull origin main
cd deploy
sudo bash scripts/repair-auth.sh
```

Para instalacao limpa:
```bash
cd /opt/sistema && git pull origin main
cd deploy
docker compose --profile baileys down -v 2>/dev/null || true
sudo rm -rf volumes/db/data
sudo bash scripts/install-unified.sh
```

### Credenciais de acesso

- Email: `admin@admin.com`
- Senha: `123456`

