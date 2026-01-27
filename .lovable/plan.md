

# Plano: Correção do Script de Instalação Self-Hosted

## Problema Identificado

O script de instalação (`deploy/scripts/install.sh`) falha silenciosamente ao criar o usuário administrador e não exibe o resumo final. Isso acontece porque:

1. A criação do admin usa `curl https://$DOMAIN/auth/v1/signup`, mas o Nginx/Kong pode não estar respondendo corretamente nesse momento
2. O script não trata erros da chamada à API
3. Não há verificação se o Nginx está pronto antes de fazer chamadas HTTPS

## Solução Proposta

### 1. Adicionar Verificação de Saúde do Nginx/Kong

Antes de criar o usuário admin, aguardar que os serviços estejam prontos:

```bash
# Após "Containers iniciados", adicionar:
wait_for_nginx() {
    local max_retries=30
    local retry=0
    
    log_info "Aguardando Nginx/Kong responderem..."
    
    while [ $retry -lt $max_retries ]; do
        # Tentar via HTTP interno primeiro (mais confiável)
        if curl -sSf -o /dev/null "http://localhost:8000/auth/v1/health" 2>/dev/null; then
            log_success "Kong está pronto"
            return 0
        fi
        
        retry=$((retry + 1))
        sleep 2
    done
    
    return 1
}
```

### 2. Usar API Interna para Criar Admin

Em vez de usar `https://$DOMAIN`, usar a API interna do Kong diretamente:

```bash
# Alterar linha 733-736 de:
RESPONSE=$(curl -s -X POST "https://$DOMAIN/auth/v1/signup" ...)

# Para:
RESPONSE=$(curl -s -X POST "http://localhost:8000/auth/v1/signup" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"data\":{\"name\":\"$ADMIN_NAME\"}}")
```

### 3. Adicionar Tratamento de Erros

```bash
if [ -z "$RESPONSE" ]; then
    log_warning "Não foi possível conectar à API. Tentando método alternativo..."
    
    # Criar usuário diretamente via banco de dados
    $DOCKER_COMPOSE exec -T db psql -U postgres -d postgres -c "
        INSERT INTO auth.users (id, email, encrypted_password, ...)
        VALUES (...)
    " 2>/dev/null || {
        log_error "Falha ao criar admin. Crie manualmente após a instalação."
    }
fi
```

### 4. Garantir Exibição do Resumo Final

Mover o resumo para fora do bloco condicional e sempre exibi-lo:

```bash
# Garantir que o resumo sempre seja exibido
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Instalação Concluída!${NC}"
echo -e "${GREEN}============================================${NC}"
# ... resto do resumo
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `deploy/scripts/install.sh` | Adicionar verificação de saúde, usar API interna, tratar erros |

## Detalhes Técnicos

### Ordem das Verificações no Script Atualizado

```text
┌─────────────────────────────────────┐
│ 1. Verificar requisitos (Docker)    │
├─────────────────────────────────────┤
│ 2. Compilar frontend                │
├─────────────────────────────────────┤
│ 3. Configurar .env                  │
├─────────────────────────────────────┤
│ 4. Iniciar containers               │
├─────────────────────────────────────┤
│ 5. Aguardar banco de dados          │
├─────────────────────────────────────┤
│ 6. Executar migrations              │
├─────────────────────────────────────┤
│ 7. NOVO: Verificar Kong/Nginx       │ <- Aguardar serviços HTTP
├─────────────────────────────────────┤
│ 8. Criar admin (via localhost:8000) │ <- Usar API interna
├─────────────────────────────────────┤
│ 9. SEMPRE exibir resumo final       │
└─────────────────────────────────────┘
```

### Mudanças Específicas no Código

**Linha 614**: Após `sleep 60`, adicionar verificação do Kong:

```bash
# Verificar se Kong está respondendo
wait_for_api() {
    local max_attempts=30
    local attempt=0
    
    log_info "Verificando disponibilidade da API..."
    
    while [ $attempt -lt $max_attempts ]; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
            "http://localhost:8000/auth/v1/health" 2>/dev/null || echo "000")
        
        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
            log_success "API está disponível"
            return 0
        fi
        
        attempt=$((attempt + 1))
        sleep 2
    done
    
    log_warning "API pode não estar totalmente disponível"
    return 1
}

wait_for_api
```

**Linhas 733-746**: Melhorar criação do admin:

```bash
log_info "Criando usuário administrador..."

# Usar API interna (localhost:8000) em vez de HTTPS externo
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:8000/auth/v1/signup" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"data\":{\"name\":\"$ADMIN_NAME\"}}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    USER_ID=$(echo $BODY | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$USER_ID" ]; then
        $DOCKER_COMPOSE exec -T db psql -U postgres -d postgres \
            -c "UPDATE user_roles SET role = 'admin' WHERE user_id = '$USER_ID';" 2>/dev/null
        log_success "Usuário admin criado com sucesso!"
        ADMIN_CREATED=true
    fi
else
    log_warning "Falha ao criar admin via API (HTTP $HTTP_CODE)"
    log_info "Você pode criar o admin manualmente após a instalação"
    ADMIN_CREATED=false
fi
```

**Linha 751**: Sempre exibir resumo:

```bash
# Resumo final (sempre exibir, independente do resultado)
show_summary() {
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  Instalação Concluída!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "  URL do Sistema: https://$DOMAIN"
    echo ""
    
    if [ "$ADMIN_CREATED" = "true" ]; then
        echo "  Credenciais do Admin:"
        echo "    Email: $ADMIN_EMAIL"
    else
        echo -e "  ${YELLOW}Admin não foi criado automaticamente.${NC}"
        echo "  Crie manualmente acessando https://$DOMAIN"
    fi
    # ... resto do resumo
}

show_summary
```

## Benefícios

1. **Instalação mais robusta**: Verifica disponibilidade dos serviços antes de usá-los
2. **Feedback claro**: Sempre mostra o resumo final, mesmo com falhas parciais
3. **Diagnóstico**: Mensagens de erro específicas para facilitar troubleshooting
4. **Compatibilidade**: Usa API interna que funciona mesmo sem SSL configurado

