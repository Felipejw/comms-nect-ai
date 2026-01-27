
# Plano: Corrigir Verificação de Saúde do Kong

## Problema Identificado

A imagem mostra que todas as 30 tentativas de verificação do Kong retornam `HTTP: 000000`, indicando que:

1. O Kong não está escutando na porta 8000
2. Os serviços que o Kong depende (auth, rest, storage, functions) ainda não estão prontos
3. O script não verifica se os containers estão realmente rodando antes de fazer health check

## Causa Raiz

```text
Containers iniciados
     |
     v
sleep 60 segundos  <-- Pode não ser suficiente
     |
     v
Verifica banco OK
     |
     v
Tenta http://localhost:8000/auth/v1/health  <-- Kong/Auth ainda inicializando
     |
     v
HTTP: 000000 (sem resposta)
```

O Kong na porta 8000 é um API Gateway que roteia para outros serviços. Se o GoTrue (auth) ainda não está pronto, o endpoint `/auth/v1/health` falha.

## Solucao Proposta

### 1. Verificar Containers Antes do Health Check

Adicionar verificacao se os containers criticos estao rodando:

```bash
wait_for_containers() {
    log_info "Verificando containers criticos..."
    
    local containers=("supabase-kong" "supabase-auth" "supabase-rest" "supabase-db")
    
    for container in "${containers[@]}"; do
        local attempts=0
        while [ $attempts -lt 30 ]; do
            if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
                log_success "$container esta rodando"
                break
            fi
            attempts=$((attempts + 1))
            sleep 2
        done
    done
}
```

### 2. Melhorar Health Check do Kong

Tentar multiplos endpoints, nao apenas o auth:

```bash
wait_for_api() {
    local max_attempts=60   # Aumentar de 30 para 60
    local attempt=0
    
    log_info "Verificando disponibilidade da API (Kong)..."
    
    # Primeiro verificar se Kong esta escutando
    while [ $attempt -lt $max_attempts ]; do
        # Tentar endpoint base do Kong primeiro
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
            "http://localhost:8000/" 2>/dev/null || echo "000")
        
        # Se Kong responde (mesmo 404 ou 401), esta funcionando
        if [ "$HTTP_CODE" != "000" ]; then
            log_success "Kong esta respondendo (HTTP $HTTP_CODE)"
            
            # Agora verificar se auth esta pronto
            AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
                "http://localhost:8000/auth/v1/health" 2>/dev/null || echo "000")
            
            if [ "$AUTH_CODE" = "200" ]; then
                log_success "API Auth esta disponivel"
                return 0
            fi
        fi
        
        attempt=$((attempt + 1))
        remaining=$((max_attempts - attempt))
        echo -e "  Tentativa $attempt/$max_attempts - Kong: $HTTP_CODE - Aguardando... ($remaining restantes)"
        sleep 3  # Aumentar de 2 para 3 segundos
    done
    
    return 1
}
```

### 3. Adicionar Timeout Inicial Mais Inteligente

Esperar containers especificos iniciarem antes do sleep:

```bash
# Apos iniciar containers
log_success "Containers iniciados"

# Aguardar containers criticos estarem "Up"
log_info "Aguardando containers iniciarem completamente..."
sleep 30

# Verificar status dos containers
log_info "Status dos containers:"
$DOCKER_COMPOSE ps

# Mais 30 segundos para serviços internos
sleep 30
```

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `deploy/scripts/install.sh` | Adicionar verificacao de containers, melhorar health check, aumentar timeouts |

## Detalhes Tecnicos

### Ordem de Inicializacao dos Serviços Supabase

```text
1. db (PostgreSQL)           - Precisa estar healthy primeiro
     |
2. auth (GoTrue)             - Depende do db
   rest (PostgREST)          - Depende do db
   storage                   - Depende do db e rest
   functions                 - Depende do rest
     |
3. kong                      - Depende de auth, rest, storage, functions
     |
4. nginx                     - Depende do kong
```

O problema e que mesmo com `depends_on`, os containers podem estar "Up" mas os servicos internos ainda inicializando.

### Mudancas no Script

**Linha 607-628**: Apos containers iniciados, adicionar verificacao mais robusta:

```bash
log_success "Containers iniciados"

# ==========================================
# 11. Aguardar Servicos Iniciarem
# ==========================================
log_info "Aguardando serviços iniciarem..."

# Primeira espera para containers subirem
sleep 30

# Verificar quais containers estão rodando
log_info "Verificando status dos containers..."
$DOCKER_COMPOSE ps

# Verificar se containers críticos estão Up
check_container_running() {
    local container=$1
    local status=$($DOCKER_COMPOSE ps $container 2>/dev/null | grep -E "Up|running" || echo "")
    if [ -n "$status" ]; then
        return 0
    fi
    return 1
}

# Aguardar containers críticos
for service in db auth rest kong; do
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if check_container_running $service; then
            log_success "Container $service está rodando"
            break
        fi
        attempts=$((attempts + 1))
        sleep 2
    done
done

# Segunda espera para serviços internos iniciarem
sleep 30
```

**Linhas 633-656**: Melhorar funcao wait_for_api:

```bash
wait_for_api() {
    local max_attempts=60
    local attempt=0
    
    log_info "Verificando disponibilidade da API (Kong)..."
    
    while [ $attempt -lt $max_attempts ]; do
        # Verificar se Kong está escutando (qualquer resposta)
        KONG_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
            "http://localhost:8000/" 2>/dev/null || echo "000")
        
        if [ "$KONG_CODE" != "000" ]; then
            # Kong está respondendo, verificar auth
            AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
                "http://localhost:8000/auth/v1/health" 2>/dev/null || echo "000")
            
            if [ "$AUTH_CODE" = "200" ]; then
                log_success "API está disponível (Kong: $KONG_CODE, Auth: $AUTH_CODE)"
                return 0
            fi
            
            echo -e "  Tentativa $attempt - Kong: $KONG_CODE, Auth: $AUTH_CODE - Aguardando..."
        else
            echo -e "  Tentativa $attempt - Kong não responde - Aguardando..."
        fi
        
        attempt=$((attempt + 1))
        sleep 3
    done
    
    log_warning "API pode não estar totalmente disponível ainda"
    log_info "Verifique os logs: docker compose logs kong auth"
    return 1
}
```

## Comandos de Diagnostico para Usuario

Enquanto isso, peca ao usuario executar estes comandos para diagnosticar:

```bash
# Ver status dos containers
cd ~/comms-nect-ai/deploy
sudo docker compose ps

# Ver logs do Kong
sudo docker compose logs kong --tail=30

# Ver logs do Auth
sudo docker compose logs auth --tail=30

# Testar Kong manualmente
curl -v http://localhost:8000/
```

## Beneficios

1. **Inicializacao mais confiavel**: Verifica containers antes de fazer health checks
2. **Melhor diagnostico**: Mostra status de cada servico separadamente
3. **Timeouts adequados**: Tempo suficiente para serviços complexos iniciarem
4. **Fallback funcional**: O fallback SQL ja implementado ira funcionar mesmo se API falhar
