

## Solucao Definitiva: Erro de Login (Auth SASL) + Reparo sem Reinstalar

### Diagnostico

O erro "Unexpected non-whitespace character after JSON" acontece porque o servico de autenticacao (GoTrue) esta **parado/crashando**. Quando o frontend tenta fazer login, o Kong retorna uma pagina HTML de erro (porque GoTrue esta fora do ar), e o cliente tenta interpretar esse HTML como JSON, causando o erro.

**Por que o Auth continua falhando?** Apos 5 tentativas, o padrao ficou claro:

A imagem `supabase/postgres:15.1.1.78` executa scripts internos em `/docker-entrypoint-initdb.d/` durante o primeiro boot. Esses scripts criam as roles (`supabase_auth_admin`, etc.) com senhas. O problema e que **todas as nossas tentativas de ALTER ROLE acontecem DEPOIS do init**, criando uma corrida (race condition) onde:

1. PostgreSQL inicia e executa scripts de init (cria roles com senhas)
2. Nosso script espera, testa, e faz ALTER ROLE
3. Mas entre o teste e o inicio do Auth, **algo pode mudar** (ex: pg_hba.conf reload, cache de autenticacao, ou o DB reinicia por OOM e os scripts de init rodam novamente com senhas diferentes)

**Solucao definitiva**: Em vez de tentar sincronizar senhas DEPOIS do init, vamos inserir nosso script de sincronizacao DENTRO da sequencia de init do PostgreSQL. Um arquivo `99-sync-passwords.sh` montado em `/docker-entrypoint-initdb.d/` roda automaticamente como o ULTIMO passo do init, garantindo que as senhas estejam corretas antes de qualquer servico conectar.

---

### O que sera feito

#### 1. Script de sincronizacao dentro do PostgreSQL init (fix definitivo)

Um script `99-sync-passwords.sh` sera:
- Criado durante a instalacao com a senha gerada
- Montado em `/docker-entrypoint-initdb.d/` (nao em subdiretorio)
- Executado automaticamente pelo PostgreSQL como ultimo script de init
- Garante que as senhas das roles correspondem ao `POSTGRES_PASSWORD`

#### 2. Script de reparo rapido (para a instalacao atual)

Como voce ja tem tudo instalado e o dominio apontado, nao precisa reinstalar. Um script `repair-auth.sh` vai:
- Sincronizar senhas das roles diretamente
- Reiniciar o servico Auth
- Verificar se ficou healthy
- Criar o usuario admin se nao existir

#### 3. Correcoes no docker-compose.yml

- Montar o `99-sync-passwords.sh` no init do PostgreSQL
- Adicionar `ADDITIONAL_REDIRECT_URLS` para eliminar o aviso do Docker Compose

#### 4. Melhorias no script de instalacao

- Remover a logica complexa de "esperar 15s + testar + ALTER ROLE" (nao e mais necessaria)
- Gerar o `99-sync-passwords.sh` durante `create_directories()`
- Melhorar a mensagem final para indicar claramente se o Auth esta saudavel ou nao

---

### Detalhes tecnicos

#### Arquivo 1: `deploy/scripts/repair-auth.sh` (NOVO)

Script que corrige o Auth sem reinstalar:

```text
1. Le POSTGRES_PASSWORD do .env
2. Executa ALTER ROLE para cada role de servico (comandos separados)
3. Faz pg_reload_conf()
4. Reinicia o container supabase-auth
5. Aguarda ate 120s pelo healthcheck
6. Se Auth ficar healthy, tenta criar admin se nao existir
7. Mostra status final
```

#### Arquivo 2: `deploy/docker-compose.yml`

Adicionar novo volume mount no servico `db`:

```yaml
volumes:
  - ./volumes/db/data:/var/lib/postgresql/data:Z
  - ./volumes/db/init/init.sql:/docker-entrypoint-initdb.d/migrations/init.sql:ro
  - ./volumes/db/init/99-sync-passwords.sh:/docker-entrypoint-initdb.d/99-sync-passwords.sh:ro
```

Adicionar `ADDITIONAL_REDIRECT_URLS` ao .env com valor padrao vazio.

#### Arquivo 3: `deploy/scripts/install-unified.sh`

**Mudanca A** - Em `create_directories()`, gerar o arquivo `99-sync-passwords.sh`:

```bash
cat > "$DEPLOY_DIR/volumes/db/init/99-sync-passwords.sh" << PASSEOF
#!/bin/bash
set -e
echo "=== Sincronizando senhas dos roles internos ==="
psql -v ON_ERROR_STOP=0 -U postgres <<-EOSQL
    ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER ROLE supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
EOSQL
echo "=== Senhas sincronizadas ==="
PASSEOF
chmod +x "$DEPLOY_DIR/volumes/db/init/99-sync-passwords.sh"
```

**Mudanca B** - Em `start_services()`, remover as etapas 1c (wait 15s), 1e (test + ALTER ROLE fallback). Manter apenas a verificacao simples apos o init.sql.

**Mudanca C** - Adicionar `ADDITIONAL_REDIRECT_URLS=` ao `.env` gerado.

---

### Como executar

**Para corrigir a instalacao atual (sem reinstalar):**

```bash
cd /opt/sistema && git pull origin main
cd deploy
sudo bash scripts/repair-auth.sh
```

**Para futuras instalacoes limpas:**

```bash
cd /opt/sistema && git pull origin main
cd deploy
docker compose --profile baileys down -v 2>/dev/null || true
sudo rm -rf volumes/db/data
sudo bash scripts/install-unified.sh
```

---

### Resultado esperado

1. `repair-auth.sh` sincroniza as senhas e reinicia o Auth
2. Auth conecta ao banco com sucesso (sem SASL error)
3. Login com `admin@admin.com` funciona
4. Kong retorna JSON valido para todas as chamadas de autenticacao
5. Futuras instalacoes usam `99-sync-passwords.sh` dentro do init do PostgreSQL, eliminando a race condition permanentemente
