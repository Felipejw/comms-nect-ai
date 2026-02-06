

# Correcao Definitiva: Startup em Etapas + Diagnostico Real

## Problemas Identificados

### Bug 1: `set -e` mata o script silenciosamente
O script tem `set -e` na linha 8, o que significa que QUALQUER comando que falhe encerra o script inteiro. Quando `docker compose --profile baileys up -d` falha na linha 597 (porque Kong depende de auth e auth esta unhealthy), o script morre ali mesmo. Todo o codigo de diagnostico, captura de logs do auth, retry, etc. NUNCA EXECUTA. Voce nunca ve o erro real do GoTrue.

### Bug 2: Startup monolitico
O `docker compose up -d` tenta iniciar todos os 12 containers simultaneamente. O Kong tem `depends_on: auth: condition: service_healthy`. Se o GoTrue crashar no boot (por qualquer motivo), Docker marca como unhealthy e retorna erro imediato. Nao ha chance de diagnosticar ou tentar novamente.

## Solucao: Startup em 3 Etapas com Diagnostico

Reescrever a funcao `start_services()` para iniciar os containers em ordem e capturar logs se algo falhar.

### Alteracao: `deploy/scripts/install-unified.sh`

**Funcao `start_services()` - reescrita completa:**

```text
start_services() {
    log_step "Iniciando Servicos"
    cd "$DEPLOY_DIR"

    # ETAPA 1: Banco de dados primeiro
    log_info "Etapa 1/3: Iniciando banco de dados..."
    docker compose up -d db
    
    # Esperar banco ficar healthy
    local db_wait=0
    local db_max=60
    while [ $db_wait -lt $db_max ]; do
        local db_health=$(docker inspect --format='{{.State.Health.Status}}' supabase-db 2>/dev/null || echo "starting")
        if [ "$db_health" = "healthy" ]; then
            log_success "Banco de dados healthy"
            break
        fi
        sleep 3
        db_wait=$((db_wait + 3))
        log_info "Aguardando banco... ($db_wait/${db_max}s)"
    done

    # ETAPA 2: Auth (GoTrue) - o container problematico
    log_info "Etapa 2/3: Iniciando servico de autenticacao..."
    docker compose up -d auth
    
    # Aguardar auth com diagnostico detalhado
    local auth_wait=0
    local auth_max=45
    local auth_ok=false
    while [ $auth_wait -lt $auth_max ]; do
        # Verificar se o container ainda esta rodando
        local auth_running=$(docker inspect --format='{{.State.Running}}' supabase-auth 2>/dev/null || echo "false")
        if [ "$auth_running" = "false" ]; then
            log_error "GoTrue CRASHOU! Exibindo logs:"
            docker logs supabase-auth --tail 30 2>&1
            
            # Tentar criar roles manualmente e reiniciar
            log_info "Tentando criar roles do Supabase manualmente..."
            docker exec supabase-db psql -U postgres -c "
                DO \$\$ BEGIN
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
                        CREATE ROLE supabase_auth_admin WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}' NOINHERIT;
                    END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
                        CREATE ROLE supabase_storage_admin WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}' NOINHERIT;
                    END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
                        CREATE ROLE authenticator WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}' NOINHERIT;
                    END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
                        CREATE ROLE anon NOLOGIN NOINHERIT;
                    END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
                        CREATE ROLE authenticated NOLOGIN NOINHERIT;
                    END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
                        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
                    END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
                        CREATE ROLE supabase_admin WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}' BYPASSRLS;
                    END IF;
                END \$\$;
                -- Grants essenciais
                GRANT anon TO authenticator;
                GRANT authenticated TO authenticator;
                GRANT service_role TO authenticator;
                GRANT supabase_admin TO authenticator;
                -- Criar schema auth se nao existir
                CREATE SCHEMA IF NOT EXISTS auth;
                GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
                GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
                -- Grants no schema public
                GRANT ALL ON SCHEMA public TO supabase_admin, supabase_auth_admin;
                GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
                ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supabase_admin, supabase_auth_admin;
                ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated, anon;
            " 2>&1 || log_warn "Alguns grants podem ter falhado (normal se ja existem)"
            
            log_info "Reiniciando auth apos criar roles..."
            docker compose up -d auth
            sleep 5
        fi
        
        local auth_health=$(docker inspect --format='{{.State.Health.Status}}' supabase-auth 2>/dev/null || echo "starting")
        if [ "$auth_health" = "healthy" ]; then
            auth_ok=true
            log_success "Servico de autenticacao healthy!"
            break
        fi
        
        sleep 3
        auth_wait=$((auth_wait + 3))
        log_info "Aguardando auth... ($auth_wait/${auth_max}s) [status: $auth_health]"
    done
    
    if [ "$auth_ok" = false ]; then
        log_error "Auth nao ficou healthy em ${auth_max}s"
        log_error "=== LOGS DO AUTH ==="
        docker logs supabase-auth --tail 40 2>&1
        log_error "=== ROLES NO BANCO ==="
        docker exec supabase-db psql -U postgres -c "SELECT rolname FROM pg_roles WHERE rolname LIKE 'supabase%' OR rolname IN ('authenticator','anon','authenticated','service_role');" 2>&1
        log_warn "Continuando instalacao mesmo com auth unhealthy..."
    fi

    # ETAPA 3: Todos os outros servicos
    log_info "Etapa 3/3: Iniciando demais servicos..."
    docker compose --profile baileys up -d || true
    
    sleep 5
    
    echo ""
    log_info "Status final dos containers:"
    services=("supabase-db" "supabase-auth" "supabase-rest" "supabase-kong" "supabase-functions" "supabase-storage" "baileys-server" "app-nginx")
    for service in "${services[@]}"; do
        local status=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "not found")
        if [ "$status" = "running" ]; then
            log_success "$service: $status"
        else
            log_warn "$service: $status"
        fi
    done
}
```

**Pontos-chave da mudanca:**

1. Remove o `set -e` que mata o script silenciosamente (ou usa `|| true` nos comandos criticos)
2. Inicia em 3 etapas: DB -> Auth -> Resto
3. Se o GoTrue crashar, captura os logs E tenta criar os roles manualmente como fallback
4. Se tudo falhar, mostra exatamente quais roles existem no banco para diagnostico
5. Nunca para o script por causa de falha do auth - continua e mostra o diagnostico

**Tambem remover `set -e` da linha 8:**

Trocar `set -e` por nada, ou por um handler mais inteligente. O `set -e` e perigoso em scripts de instalacao complexos porque qualquer comando trivial que falhe mata tudo silenciosamente.

### Funcoes `wait_for_database()` e `wait_for_auth()`

Como a nova `start_services()` ja faz toda a espera e diagnostico, essas funcoes se tornam redundantes. Simplificar para apenas uma verificacao rapida, ou remover e deixar a logica toda em `start_services()`.

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `deploy/scripts/install-unified.sh` | Remover `set -e`, reescrever `start_services()` com startup em etapas, fallback de criacao de roles, e diagnostico completo |

Nenhuma alteracao no docker-compose.yml ou init.sql (as correcoes anteriores ja estao corretas).

## Por que desta vez vai funcionar

O problema nunca foi so o volume mount (ja corrigido). O problema e que quando o GoTrue falha por QUALQUER motivo:
- `set -e` mata o script
- Voce nunca ve o log do erro real
- Nao ha fallback

Com esta mudanca:
- O script NAO morre quando algo falha
- Se GoTrue crashar, voce VE os logs do crash no terminal
- Se os roles nao existirem, o script os CRIA manualmente
- Se mesmo assim falhar, voce ve exatamente quais roles existem vs quais faltam

