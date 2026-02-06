#!/bin/bash

# ============================================
# Script de Reparo do Auth (GoTrue)
# Corrige SASL authentication failures sem reinstalar
# Gera roles.sql, sincroniza senhas, testa cadeia completa
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${CYAN}=== $1 ===${NC}\n"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Verificar root
if [ "$EUID" -ne 0 ]; then
    log_error "Execute como root: sudo $0"
    exit 1
fi

cd "$DEPLOY_DIR"

# Verificar .env
if [ ! -f "$DEPLOY_DIR/.env" ]; then
    log_error "Arquivo .env não encontrado em $DEPLOY_DIR"
    exit 1
fi

# Carregar variáveis
source "$DEPLOY_DIR/.env"

if [ -z "$POSTGRES_PASSWORD" ]; then
    log_error "POSTGRES_PASSWORD não definido no .env"
    exit 1
fi

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              REPARO DO SERVIÇO DE AUTENTICAÇÃO               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# =============================================
# ETAPA 1: Gerar roles.sql (padrão oficial Supabase)
# =============================================
log_step "Gerando roles.sql"

mkdir -p "$DEPLOY_DIR/volumes/db/init"

# Gerar roles.sql usando \set pgpass (padrão oficial Supabase)
# O PostgreSQL lê POSTGRES_PASSWORD do ambiente do container em runtime
cat > "$DEPLOY_DIR/volumes/db/roles.sql" << 'ROLESEOF'
-- roles.sql: Set passwords for internal Supabase roles
-- This file follows the official Supabase self-hosted pattern
-- Mounted at /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
ROLESEOF
log_success "roles.sql gerado (formato oficial com \\set pgpass)"

# Gerar 99-sync-passwords.sh como fallback
cat > "$DEPLOY_DIR/volumes/db/init/99-sync-passwords.sh" << PASSEOF
#!/bin/bash
set -e
echo "=== Sincronizando senhas dos roles internos ==="
psql -v ON_ERROR_STOP=0 -U postgres <<-EOSQL
    ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER ROLE supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
EOSQL
echo "=== Senhas sincronizadas com sucesso ==="
PASSEOF
chmod +x "$DEPLOY_DIR/volumes/db/init/99-sync-passwords.sh"
log_success "99-sync-passwords.sh gerado"

# =============================================
# ETAPA 2: Verificar banco de dados
# =============================================
log_step "Verificando Banco de Dados"

db_health=$(docker inspect --format='{{.State.Health.Status}}' supabase-db 2>/dev/null || echo "not found")
if [ "$db_health" != "healthy" ]; then
    log_error "Banco de dados não está healthy (status: $db_health)"
    log_info "Iniciando banco de dados..."
    docker compose up -d db
    
    local_wait=0
    while [ $local_wait -lt 60 ]; do
        db_health=$(docker inspect --format='{{.State.Health.Status}}' supabase-db 2>/dev/null || echo "starting")
        if [ "$db_health" = "healthy" ]; then
            break
        fi
        sleep 3
        local_wait=$((local_wait + 3))
    done
    
    if [ "$db_health" != "healthy" ]; then
        log_error "Banco não ficou healthy. Abortando."
        exit 1
    fi
fi
log_success "Banco de dados: healthy"

# =============================================
# ETAPA 3: Sincronizar senhas das roles via SQL direto
# =============================================
log_step "Sincronizando Senhas das Roles"

log_info "Alterando senha de supabase_auth_admin..."
docker exec supabase-db psql -U postgres -c \
    "ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>&1
    
log_info "Alterando senha de supabase_storage_admin..."
docker exec supabase-db psql -U postgres -c \
    "ALTER ROLE supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>&1

log_info "Alterando senha de authenticator..."
docker exec supabase-db psql -U postgres -c \
    "ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>&1

# Recarregar configuração do PostgreSQL
log_info "Recarregando configuração do PostgreSQL..."
docker exec supabase-db psql -U postgres -c "SELECT pg_reload_conf();" 2>/dev/null
sleep 2

log_success "Senhas sincronizadas"

# =============================================
# ETAPA 4: Regenerar config.js do frontend
# =============================================
log_step "Atualizando config.js"

if [ -d "$DEPLOY_DIR/frontend/dist" ]; then
    cat > "$DEPLOY_DIR/frontend/dist/config.js" << CONFIGEOF
window.__SUPABASE_CONFIG__ = {
  url: window.location.origin,
  anonKey: "${ANON_KEY}"
};
CONFIGEOF
    log_success "config.js atualizado (usa origin dinâmico)"
else
    log_warn "Diretório frontend/dist não encontrado"
fi

# =============================================
# ETAPA 5: Reiniciar Auth + Nginx
# =============================================
log_step "Reiniciando Serviços"

docker compose restart auth 2>/dev/null || docker restart supabase-auth 2>/dev/null

# Aguardar auth ficar healthy
auth_wait=0
auth_max=120
auth_ok=false

while [ $auth_wait -lt $auth_max ]; do
    auth_health=$(docker inspect --format='{{.State.Health.Status}}' supabase-auth 2>/dev/null || echo "starting")
    
    if [ "$auth_health" = "healthy" ]; then
        auth_ok=true
        log_success "Auth ficou healthy em ${auth_wait}s!"
        break
    fi
    
    # Se crashou, reiniciar
    auth_running=$(docker inspect --format='{{.State.Running}}' supabase-auth 2>/dev/null || echo "false")
    if [ "$auth_running" = "false" ]; then
        log_warn "Auth crashou, reiniciando..."
        docker compose up -d auth 2>/dev/null
    fi
    
    sleep 3
    auth_wait=$((auth_wait + 3))
    log_info "Aguardando auth... ($auth_wait/${auth_max}s) [status: $auth_health]"
done

if [ "$auth_ok" = "false" ]; then
    log_error "Auth não ficou healthy em ${auth_max}s"
    echo ""
    log_error "=== LOGS DO AUTH ==="
    docker logs supabase-auth --tail 30 2>&1
    echo ""
    log_error "O problema pode ser mais profundo. Considere reinstalar:"
    echo "  docker compose --profile baileys down -v"
    echo "  sudo rm -rf volumes/db/data"
    echo "  sudo bash scripts/install-unified.sh"
    exit 1
fi

# Reiniciar Nginx para pegar novo config.js e correções CORS
docker compose restart nginx 2>/dev/null || docker restart app-nginx 2>/dev/null
log_success "Nginx reiniciado"

# =============================================
# ETAPA 6: Verificar/Criar admin com senha 123456
# =============================================
log_step "Verificando Usuário Admin"

ADMIN_EMAIL="admin@admin.com"
ADMIN_PASSWORD="123456"

ADMIN_EXISTS=$(docker exec supabase-db psql -U postgres -t -c "
    SELECT COUNT(*) FROM auth.users WHERE email = '${ADMIN_EMAIL}';
" 2>/dev/null | tr -d ' \n')

if [ "$ADMIN_EXISTS" = "0" ] || [ -z "$ADMIN_EXISTS" ]; then
    log_info "Admin não encontrado. Criando ${ADMIN_EMAIL} com senha ${ADMIN_PASSWORD}..."
    
    # Tentar via API primeiro
    signup_response=$(curl -s -X POST "http://localhost:8000/auth/v1/signup" \
        -H "apikey: ${ANON_KEY}" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"${ADMIN_EMAIL}\",
            \"password\": \"${ADMIN_PASSWORD}\",
            \"data\": {\"name\": \"Administrador\"}
        }" 2>/dev/null)
    
    ADMIN_USER_ID=$(echo "$signup_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$ADMIN_USER_ID" ]; then
        log_info "API signup falhou. Criando via SQL..."
        ADMIN_USER_ID=$(docker exec supabase-db psql -U postgres -t -c "
            INSERT INTO auth.users (
                instance_id, id, aud, role, email,
                encrypted_password, email_confirmed_at,
                raw_app_meta_data, raw_user_meta_data,
                created_at, updated_at, confirmation_token
            ) VALUES (
                '00000000-0000-0000-0000-000000000000',
                gen_random_uuid(), 'authenticated', 'authenticated',
                '${ADMIN_EMAIL}',
                crypt('${ADMIN_PASSWORD}', gen_salt('bf')),
                now(),
                '{\"provider\": \"email\", \"providers\": [\"email\"]}'::jsonb,
                '{\"name\": \"Administrador\"}'::jsonb,
                now(), now(), ''
            ) RETURNING id;
        " 2>/dev/null | tr -d ' \n')
    fi
    
    if [ -n "$ADMIN_USER_ID" ]; then
        # Promover para super_admin
        docker exec supabase-db psql -U postgres -c "
            DELETE FROM public.user_roles WHERE user_id = '${ADMIN_USER_ID}';
            INSERT INTO public.user_roles (user_id, role)
            VALUES ('${ADMIN_USER_ID}', 'super_admin')
            ON CONFLICT (user_id, role) DO NOTHING;
        " 2>/dev/null
        
        log_success "Admin criado!"
    else
        log_warn "Não foi possível criar o admin automaticamente"
    fi
else
    log_success "Admin ${ADMIN_EMAIL} já existe"
    log_info "Atualizando senha para ${ADMIN_PASSWORD}..."
    docker exec supabase-db psql -U postgres -c "
        UPDATE auth.users 
        SET encrypted_password = crypt('${ADMIN_PASSWORD}', gen_salt('bf')),
            updated_at = now()
        WHERE email = '${ADMIN_EMAIL}';
    " 2>/dev/null
    log_success "Senha do admin atualizada para ${ADMIN_PASSWORD}"
fi

# =============================================
# ETAPA 7: Diagnóstico completo da cadeia
# =============================================
log_step "Diagnóstico End-to-End"

DIAG_PASS=0
DIAG_FAIL=0

# Teste 1: DB healthy
echo -n "  Teste 1/7 - DB healthy: "
db_h=$(docker inspect --format='{{.State.Health.Status}}' supabase-db 2>/dev/null)
if [ "$db_h" = "healthy" ]; then
    echo -e "${GREEN}OK${NC}"
    DIAG_PASS=$((DIAG_PASS + 1))
else
    echo -e "${RED}FALHOU ($db_h)${NC}"
    DIAG_FAIL=$((DIAG_FAIL + 1))
fi

# Teste 2: Senha do supabase_auth_admin funciona
echo -n "  Teste 2/7 - Senha auth_admin: "
network_name=$(docker inspect supabase-db --format='{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)
if [ -z "$network_name" ]; then
    network_name="deploy_supabase-network"
fi

if docker run --rm --network "$network_name" \
    -e PGPASSWORD="${POSTGRES_PASSWORD}" \
    postgres:15-alpine \
    psql -U supabase_auth_admin -h db -d postgres -c "SELECT 1;" 2>/dev/null | grep -q "1"; then
    echo -e "${GREEN}OK${NC}"
    DIAG_PASS=$((DIAG_PASS + 1))
else
    echo -e "${RED}FALHOU${NC}"
    DIAG_FAIL=$((DIAG_FAIL + 1))
fi

# Teste 3: Auth healthy
echo -n "  Teste 3/7 - Auth healthy: "
auth_h=$(docker inspect --format='{{.State.Health.Status}}' supabase-auth 2>/dev/null)
if [ "$auth_h" = "healthy" ]; then
    echo -e "${GREEN}OK${NC}"
    DIAG_PASS=$((DIAG_PASS + 1))
else
    echo -e "${RED}FALHOU ($auth_h)${NC}"
    DIAG_FAIL=$((DIAG_FAIL + 1))
fi

# Teste 4: Kong responde no /auth/v1/health
echo -n "  Teste 4/7 - Kong -> Auth: "
kong_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/auth/v1/health" 2>/dev/null || echo "000")
if [ "$kong_code" = "200" ]; then
    echo -e "${GREEN}OK (HTTP $kong_code)${NC}"
    DIAG_PASS=$((DIAG_PASS + 1))
else
    echo -e "${RED}FALHOU (HTTP $kong_code)${NC}"
    DIAG_FAIL=$((DIAG_FAIL + 1))
fi

# Teste 5: Nginx responde no /auth/v1/health
echo -n "  Teste 5/7 - Nginx -> Kong -> Auth: "
nginx_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/auth/v1/health" 2>/dev/null || echo "000")
if [ "$nginx_code" = "200" ]; then
    echo -e "${GREEN}OK (HTTP $nginx_code)${NC}"
    DIAG_PASS=$((DIAG_PASS + 1))
else
    echo -e "${RED}FALHOU (HTTP $nginx_code)${NC}"
    DIAG_FAIL=$((DIAG_FAIL + 1))
fi

# Teste 6: OPTIONS retorna headers CORS
echo -n "  Teste 6/7 - CORS (OPTIONS preflight): "
cors_header=$(curl -s -X OPTIONS -I "http://localhost/auth/v1/token?grant_type=password" \
    -H "Origin: https://example.com" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type, apikey, Authorization" \
    2>/dev/null | grep -i "access-control-allow-origin" | head -1)
if echo "$cors_header" | grep -qi "access-control-allow-origin"; then
    echo -e "${GREEN}OK${NC}"
    DIAG_PASS=$((DIAG_PASS + 1))
else
    echo -e "${RED}FALHOU (sem header CORS na resposta OPTIONS)${NC}"
    DIAG_FAIL=$((DIAG_FAIL + 1))
fi

# Teste 7: Login funciona via curl
echo -n "  Teste 7/7 - Login POST: "
login_response=$(curl -s -w "\n%{http_code}" -X POST "http://localhost/auth/v1/token?grant_type=password" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" 2>/dev/null)
login_code=$(echo "$login_response" | tail -1)
login_body=$(echo "$login_response" | head -n -1)

if [ "$login_code" = "200" ]; then
    echo -e "${GREEN}OK (HTTP $login_code)${NC}"
    DIAG_PASS=$((DIAG_PASS + 1))
else
    echo -e "${RED}FALHOU (HTTP $login_code)${NC}"
    if [ -n "$login_body" ]; then
        echo "    Resposta: $(echo "$login_body" | head -c 200)"
    fi
    DIAG_FAIL=$((DIAG_FAIL + 1))
fi

# =============================================
# RESULTADO FINAL
# =============================================
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "  Diagnóstico: ${GREEN}$DIAG_PASS OK${NC} / ${RED}$DIAG_FAIL FALHOU${NC} (de 7 testes)"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"

if [ "$DIAG_FAIL" -eq 0 ]; then
    echo ""
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║           REPARO CONCLUÍDO COM SUCESSO!                      ║"
    echo "║       Todos os 7 testes passaram. Login funcionando.         ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
else
    echo ""
    echo -e "${YELLOW}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║           REPARO CONCLUÍDO COM ALERTAS                       ║"
    echo "║       $DIAG_FAIL teste(s) falharam. Veja acima.                     ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
fi

echo ""
echo -e "${CYAN}=== CREDENCIAIS ===${NC}"
echo -e "  Email: ${YELLOW}${ADMIN_EMAIL}${NC}"
echo -e "  Senha: ${YELLOW}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "  Acesse: ${GREEN}http://$DOMAIN${NC} ou ${GREEN}https://$DOMAIN${NC}"
echo ""
