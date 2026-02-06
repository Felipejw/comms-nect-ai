

# Corrigir Falha do supabase-auth: Conflito de Senha do Banco

## Problema Identificado

O container `supabase-auth` esta falhando porque nao consegue se autenticar no banco de dados. A causa raiz:

1. O script `install-unified.sh` gera uma **nova senha** (`openssl rand...`) toda vez que roda
2. Na primeira execucao, o PostgreSQL inicializa com essa senha e cria os roles internos (`supabase_auth_admin`, `authenticator`, etc.)
3. Na segunda execucao (reinstalacao), o diretorio `./volumes/db/data` ja existe com dados da execucao anterior
4. O PostgreSQL **ignora todos os scripts de inicializacao** quando os dados ja existem (comportamento padrao)
5. O GoTrue tenta conectar usando a senha NOVA, mas o banco ainda tem a senha ANTIGA
6. Resultado: falha de autenticacao, container marcado como "unhealthy", todos os servicos dependentes falham

## Solucao

Adicionar no script de instalacao a limpeza dos volumes do banco antes de iniciar, **quando for uma instalacao limpa**, e preservar dados quando for uma atualizacao.

### Alteracao 1: `deploy/scripts/install-unified.sh`

**Na funcao `create_directories()`** - Adicionar limpeza do volume do banco para garantir consistencia:

```text
create_directories() {
    log_step "Criando Estrutura de Diretorios"
    
    # NOVO: Limpar dados do banco se existirem (reinstalacao limpa)
    # Isso garante que o PostgreSQL rode o init.sql com a senha nova
    if [ -d "$DEPLOY_DIR/volumes/db/data" ]; then
        log_warn "Dados anteriores do banco encontrados"
        log_info "Limpando para reinstalacao limpa..."
        
        # Parar containers antes de limpar
        cd "$DEPLOY_DIR"
        docker compose --profile baileys down -v 2>/dev/null || true
        
        rm -rf "$DEPLOY_DIR/volumes/db/data"
        log_success "Dados antigos removidos"
    fi
    
    mkdir -p "$DEPLOY_DIR/volumes/db/data"
    # ... resto da funcao continua igual
}
```

**Na funcao `start_services()`** - Adicionar verificacao especifica do container auth:

```text
# Apos o loop de espera, verificar especificamente o auth
local auth_status=$(docker inspect --format='{{.State.Health.Status}}' supabase-auth 2>/dev/null || echo "not found")
if [ "$auth_status" = "unhealthy" ]; then
    log_error "Container supabase-auth esta unhealthy!"
    log_error "=== Ultimas 20 linhas de log do Auth ==="
    docker logs supabase-auth --tail 20 2>&1
    log_info "Tentando reiniciar..."
    docker compose restart auth
    sleep 15
fi
```

### Alteracao 2: `deploy/docker-compose.yml`

Reduzir o `start_period` do health check do Auth. Atualmente com `start_period: 30s` e `retries: 20`, o Docker espera 130 segundos mesmo quando o container ja crashou. Ajustar para detectar falhas mais rapido:

```text
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9999/health"]
      timeout: 5s
      interval: 5s
      retries: 30
      start_period: 10s
```

Isso permite 160 segundos totais (suficiente para iniciar), mas com apenas 10s de "graca" no inicio.

## Fluxo de Inicializacao Corrigido

```text
1. Script detecta que volumes/db/data existe da tentativa anterior
2. Para todos os containers e remove dados antigos do banco
3. Gera nova senha, JWT Secret, e chaves
4. Inicia containers (banco limpo = executa init.sql com senha nova)
5. Todos os roles sao criados com a senha correta
6. GoTrue conecta com sucesso usando supabase_auth_admin + senha nova
7. Kong inicia apos auth ficar healthy
8. Admin e tenant sao criados normalmente
```

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `deploy/scripts/install-unified.sh` | Limpar volumes/db/data antes de reinstalar + diagnosticos do auth |
| `deploy/docker-compose.yml` | Ajustar health check timings do auth |

Nenhuma alteracao no frontend ou backend Cloud.
