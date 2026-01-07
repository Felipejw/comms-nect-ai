#!/bin/bash

# ============================================
# Script de Bump de Versão - Sistema de Atendimento
# Gerencia versionamento semântico (SemVer)
# ============================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

# Diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

# ==========================================
# Funções de Versão
# ==========================================

get_current_version() {
    if [ -f "VERSION" ]; then
        cat VERSION | tr -d '[:space:]'
    else
        echo "0.0.0"
    fi
}

parse_version() {
    local version=$1
    echo "$version" | sed -E 's/^v?//'
}

get_major() {
    local version=$(parse_version "$1")
    echo "$version" | cut -d. -f1
}

get_minor() {
    local version=$(parse_version "$1")
    echo "$version" | cut -d. -f2
}

get_patch() {
    local version=$(parse_version "$1")
    echo "$version" | cut -d. -f3
}

bump_major() {
    local version=$(parse_version "$1")
    local major=$(get_major "$version")
    echo "$((major + 1)).0.0"
}

bump_minor() {
    local version=$(parse_version "$1")
    local major=$(get_major "$version")
    local minor=$(get_minor "$version")
    echo "$major.$((minor + 1)).0"
}

bump_patch() {
    local version=$(parse_version "$1")
    local major=$(get_major "$version")
    local minor=$(get_minor "$version")
    local patch=$(get_patch "$version")
    echo "$major.$minor.$((patch + 1))"
}

# ==========================================
# Atualizar CHANGELOG
# ==========================================

update_changelog() {
    local new_version=$1
    local bump_type=$2
    local date=$(date +%Y-%m-%d)
    
    if [ ! -f "CHANGELOG.md" ]; then
        cat > CHANGELOG.md << 'EOF'
# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

EOF
    fi
    
    # Criar entrada temporária
    local temp_file=$(mktemp)
    
    cat > "$temp_file" << EOF
# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

## [$new_version] - $date

### Adicionado
- 

### Modificado
- 

### Corrigido
- 

### Removido
- 

---

EOF
    
    # Adicionar conteúdo existente (pulando o header)
    tail -n +4 CHANGELOG.md >> "$temp_file"
    
    mv "$temp_file" CHANGELOG.md
    
    log_success "CHANGELOG.md atualizado com template para v$new_version"
}

# ==========================================
# Menu Principal
# ==========================================

show_help() {
    echo ""
    echo -e "${CYAN}Uso:${NC} ./scripts/bump.sh [comando] [opções]"
    echo ""
    echo -e "${CYAN}Comandos:${NC}"
    echo "  major         Incrementa versão MAJOR (x.0.0) - Breaking changes"
    echo "  minor         Incrementa versão MINOR (0.x.0) - Novas funcionalidades"
    echo "  patch         Incrementa versão PATCH (0.0.x) - Correções de bugs"
    echo "  set VERSION   Define uma versão específica (ex: 2.0.0)"
    echo "  show          Mostra a versão atual"
    echo "  help          Mostra esta ajuda"
    echo ""
    echo -e "${CYAN}Opções:${NC}"
    echo "  --package     Executa o script de empacotamento após o bump"
    echo "  --no-changelog Não atualiza o CHANGELOG.md"
    echo ""
    echo -e "${CYAN}Exemplos:${NC}"
    echo "  ./scripts/bump.sh patch              # 1.0.0 → 1.0.1"
    echo "  ./scripts/bump.sh minor              # 1.0.1 → 1.1.0"
    echo "  ./scripts/bump.sh major              # 1.1.0 → 2.0.0"
    echo "  ./scripts/bump.sh set 3.0.0          # Define para 3.0.0"
    echo "  ./scripts/bump.sh patch --package    # Bump + gera pacotes"
    echo ""
    echo -e "${CYAN}Versionamento Semântico:${NC}"
    echo "  MAJOR - Mudanças incompatíveis com versões anteriores"
    echo "  MINOR - Novas funcionalidades compatíveis"
    echo "  PATCH - Correções de bugs compatíveis"
    echo ""
}

# ==========================================
# Processar Argumentos
# ==========================================

COMMAND=""
SET_VERSION=""
DO_PACKAGE=false
UPDATE_CHANGELOG=true

while [[ $# -gt 0 ]]; do
    case $1 in
        major|minor|patch|show|help)
            COMMAND=$1
            shift
            ;;
        set)
            COMMAND="set"
            SET_VERSION=$2
            shift 2
            ;;
        --package)
            DO_PACKAGE=true
            shift
            ;;
        --no-changelog)
            UPDATE_CHANGELOG=false
            shift
            ;;
        *)
            log_error "Comando desconhecido: $1"
            show_help
            exit 1
            ;;
    esac
done

# ==========================================
# Executar Comando
# ==========================================

CURRENT_VERSION=$(get_current_version)

echo -e "${BLUE}"
echo "============================================"
echo "  Gerenciador de Versão"
echo "  Versão atual: $CURRENT_VERSION"
echo "============================================"
echo -e "${NC}"

case $COMMAND in
    show)
        echo "Versão atual: $CURRENT_VERSION"
        exit 0
        ;;
    
    help|"")
        show_help
        exit 0
        ;;
    
    major)
        NEW_VERSION=$(bump_major "$CURRENT_VERSION")
        BUMP_TYPE="major"
        ;;
    
    minor)
        NEW_VERSION=$(bump_minor "$CURRENT_VERSION")
        BUMP_TYPE="minor"
        ;;
    
    patch)
        NEW_VERSION=$(bump_patch "$CURRENT_VERSION")
        BUMP_TYPE="patch"
        ;;
    
    set)
        if [ -z "$SET_VERSION" ]; then
            log_error "Versão não especificada"
            echo "Uso: ./scripts/bump.sh set X.Y.Z"
            exit 1
        fi
        
        # Validar formato
        if ! echo "$SET_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
            log_error "Formato de versão inválido: $SET_VERSION"
            echo "Use o formato: X.Y.Z (ex: 2.0.0)"
            exit 1
        fi
        
        NEW_VERSION="$SET_VERSION"
        BUMP_TYPE="set"
        ;;
esac

# Confirmar alteração
echo ""
echo -e "${YELLOW}Alterar versão:${NC}"
echo "  $CURRENT_VERSION → $NEW_VERSION"
echo ""
read -p "Confirmar? (s/N): " confirm

if [ "$confirm" != "s" ] && [ "$confirm" != "S" ]; then
    log_info "Operação cancelada"
    exit 0
fi

# ==========================================
# Aplicar Alterações
# ==========================================

# Atualizar VERSION
echo "$NEW_VERSION" > VERSION
log_success "VERSION atualizado para $NEW_VERSION"

# Atualizar CHANGELOG
if [ "$UPDATE_CHANGELOG" = true ]; then
    update_changelog "$NEW_VERSION" "$BUMP_TYPE"
    echo ""
    log_warning "Edite o CHANGELOG.md para adicionar as alterações desta versão"
fi

# Executar empacotamento
if [ "$DO_PACKAGE" = true ]; then
    echo ""
    log_info "Executando empacotamento..."
    ./scripts/package.sh
fi

# ==========================================
# Resumo
# ==========================================

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Versão Atualizada com Sucesso!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Versão anterior: $CURRENT_VERSION"
echo "  Nova versão:     $NEW_VERSION"
echo ""
echo -e "${CYAN}Próximos passos:${NC}"
echo "  1. Edite o CHANGELOG.md com as alterações"
echo "  2. Execute: ./scripts/package.sh"
echo "  3. Distribua os pacotes para seus clientes"
echo ""
