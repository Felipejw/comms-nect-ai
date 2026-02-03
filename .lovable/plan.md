

# Plano: Melhorar Fluxo de Instalação do Baileys

## Problema Identificado

O script atual falha imediatamente se o usuário não digitar um domínio. Isso acontece porque:
1. Não há instrução prévia clara sobre o que é necessário ANTES de iniciar
2. Não permite tentar novamente se errar
3. Não oferece opção de usar apenas IP (sem SSL)

## Melhorias Propostas

### 1. Adicionar Checklist de Pré-requisitos

Antes de pedir qualquer informação, mostrar claramente o que é necessário:

```text
╔════════════════════════════════════════════════════════════╗
║   ANTES DE CONTINUAR, VOCE PRECISA TER:                   ║
╠════════════════════════════════════════════════════════════╣
║   1. Um dominio apontando para este servidor              ║
║      (ex: baileys.seusite.com.br)                         ║
║                                                            ║
║   2. Portas 80 e 443 liberadas no firewall                ║
║                                                            ║
║   3. Um email valido (para certificado SSL)               ║
╚════════════════════════════════════════════════════════════╝

Tem tudo pronto? [s/N]
```

### 2. Validação com Retry

Permitir que o usuário tente novamente se digitar errado:

```bash
while true; do
    read -p "Digite o dominio (ex: baileys.meusite.com.br): " DOMAIN
    if [ -z "$DOMAIN" ]; then
        log_warning "Dominio nao pode ser vazio. Tente novamente."
        continue
    fi
    # Validar formato basico
    if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        log_warning "Formato invalido. Use algo como: baileys.seusite.com.br"
        continue
    fi
    break
done
```

### 3. Verificar DNS Antes de Continuar

Testar se o domínio realmente aponta para o servidor:

```bash
# Obter IP publico do servidor
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com)

# Resolver dominio
DOMAIN_IP=$(dig +short "$DOMAIN" | head -1)

if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
    log_warning "ATENCAO: O dominio $DOMAIN nao aponta para este servidor!"
    log_warning "  IP do servidor: $SERVER_IP"
    log_warning "  IP do dominio:  $DOMAIN_IP"
    echo ""
    read -p "Deseja continuar mesmo assim? [s/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        log_info "Configure o DNS e execute novamente."
        exit 0
    fi
fi
```

### 4. Opção de Instalação sem SSL (Desenvolvimento)

Permitir usar apenas IP para testes:

```bash
echo ""
echo "Escolha o modo de instalacao:"
echo "  1) Com dominio e SSL (producao) - RECOMENDADO"
echo "  2) Apenas IP, sem SSL (desenvolvimento/teste)"
echo ""
read -p "Opcao [1]: " INSTALL_MODE
INSTALL_MODE=${INSTALL_MODE:-1}

if [ "$INSTALL_MODE" = "2" ]; then
    # Modo desenvolvimento - sem SSL
    DOMAIN=$(curl -s ifconfig.me)
    USE_SSL=false
    log_warning "Modo desenvolvimento: SSL desabilitado"
else
    # Modo producao - com SSL
    USE_SSL=true
    # ... pedir dominio
fi
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `deploy/baileys/scripts/install.sh` | Adicionar checklist, validação, verificação DNS, modo dev |
| `deploy/baileys/scripts/bootstrap.sh` | Adicionar instrução inicial sobre pré-requisitos |

## Fluxo Corrigido

```text
bootstrap.sh inicia
         │
         ▼
    Verifica OS, RAM, Disco
         │
         ▼
    Baixa arquivos para /opt/baileys
         │
         ▼
    Executa install.sh
         │
         ▼
┌────────────────────────────────┐
│   CHECKLIST PRE-REQUISITOS    │
│   - Dominio configurado?      │
│   - Portas liberadas?         │
│   - Email valido?             │
│                               │
│   Tem tudo? [s/N]             │
└───────────┬────────────────────┘
            │
            ▼
┌────────────────────────────────┐
│   MODO DE INSTALACAO          │
│   1) Producao (com SSL)       │
│   2) Desenvolvimento (sem SSL)│
└───────────┬────────────────────┘
            │
     ┌──────┴──────┐
     │             │
     ▼             ▼
  Modo 1        Modo 2
(pede dominio) (usa IP)
     │             │
     ▼             ▼
Valida formato  Pula SSL
     │             │
     ▼             │
Verifica DNS    │
     │             │
     └──────┬──────┘
            │
            ▼
     Gera API Key
            │
            ▼
     Configura .env
            │
            ▼
     Inicia Docker
            │
            ▼
     SUCESSO!
```

## Benefícios

1. **Menos erros** - Usuário sabe o que precisa ANTES de começar
2. **Retry amigável** - Pode corrigir erros sem reiniciar
3. **Verificação DNS** - Detecta problemas de configuração cedo
4. **Modo dev** - Permite testar sem domínio configurado
5. **Mensagens claras** - Feedback em cada etapa

