#!/bin/bash

# ============================================
# Bootstrap Script - Instalação One-Line
# Sistema de Atendimento + Baileys WhatsApp
# ============================================
# 
# USO:
#   curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/scripts/bootstrap.sh | sudo bash
#
# ============================================

set -e

# Garantir diretorio de trabalho seguro (evita erro se /opt/sistema for deletado)
cd /tmp 2>/dev/null || cd /

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configurações
REPO_URL="https://github.com/Felipejw/comms-nect-ai.git"
INSTALL_DIR="/opt/sistema"
BRANCH="main"

# Banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       SISTEMA DE ATENDIMENTO - INSTALAÇÃO AUTOMÁTICA         ║"
echo "║                                                               ║"
echo "║              Bootstrap Script v1.1                            ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERRO]${NC} Execute como root: curl ... | sudo bash"
    exit 1
fi

echo -e "${BLUE}[INFO]${NC} Iniciando instalação..."

# Instalar git se necessário
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}[INFO]${NC} Instalando Git..."
    apt-get update -qq
    apt-get install -y git
fi

# ==========================================
# PASSO 1: Baixar arquivos PRIMEIRO (antes de tocar na instalação antiga)
# ==========================================
echo -e "${BLUE}[INFO]${NC} Clonando repositório..."

# Limpar clone residual anterior
rm -rf /tmp/comms-nect-ai-sistema

# Garantir que estamos em diretório válido
cd /tmp

# Clonar repositório (|| true para não abortar com set -e)
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" /tmp/comms-nect-ai-sistema 2>/dev/null || true

# Verificar se o download funcionou
if [ ! -d "/tmp/comms-nect-ai-sistema/deploy" ]; then
    echo -e "${RED}[ERRO]${NC} Falha ao baixar arquivos do GitHub."
    echo -e "${RED}[ERRO]${NC} Verifique se o repositório existe e está acessível: $REPO_URL"
    echo -e "${RED}[ERRO]${NC} A instalação atual NÃO foi modificada."
    rm -rf /tmp/comms-nect-ai-sistema
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Download concluído com sucesso!"

# ==========================================
# PASSO 2: SÓ AGORA fazer backup e remover instalação antiga
# ==========================================
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}[WARN]${NC} Diretório $INSTALL_DIR já existe"
    echo -e "${BLUE}[INFO]${NC} Fazendo backup das sessões automaticamente..."
    
    # Backup das sessões WhatsApp
    if [ -d "$INSTALL_DIR/deploy/volumes/baileys/sessions" ]; then
        mkdir -p /tmp/baileys-backup
        cp -r "$INSTALL_DIR/deploy/volumes/baileys/sessions/"* /tmp/baileys-backup/ 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} Sessões WhatsApp salvas em /tmp/baileys-backup"
    fi
    
    # Backup do .env se existir
    if [ -f "$INSTALL_DIR/deploy/.env" ]; then
        cp "$INSTALL_DIR/deploy/.env" /tmp/sistema-env-backup 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} Arquivo .env salvo em /tmp/sistema-env-backup"
    fi
    
    # Parar containers existentes
    if [ -f "$INSTALL_DIR/deploy/docker-compose.yml" ]; then
        cd "$INSTALL_DIR/deploy"
        docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
    fi
    
    # Mudar para diretório seguro ANTES de deletar
    cd /tmp
    
    # Remover diretório antigo
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}[OK]${NC} Instalação anterior removida"
fi

# ==========================================
# PASSO 3: Mover arquivos novos para diretório final
# ==========================================
mv /tmp/comms-nect-ai-sistema "$INSTALL_DIR"

# Restaurar sessões do backup
if [ -d "/tmp/baileys-backup" ] && [ "$(ls -A /tmp/baileys-backup 2>/dev/null)" ]; then
    echo -e "${GREEN}[OK]${NC} Restaurando sessões do backup..."
    mkdir -p "$INSTALL_DIR/deploy/volumes/baileys/sessions"
    cp -r /tmp/baileys-backup/* "$INSTALL_DIR/deploy/volumes/baileys/sessions/"
    rm -rf /tmp/baileys-backup
fi

# Tornar scripts executáveis
chmod +x "$INSTALL_DIR/deploy/scripts/"*.sh

# Executar instalação
echo -e "${GREEN}[OK]${NC} Repositório clonado com sucesso!"
echo -e "${BLUE}[INFO]${NC} Iniciando instalação unificada..."
echo ""

cd "$INSTALL_DIR/deploy"
./scripts/install-unified.sh < /dev/tty

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║              BOOTSTRAP CONCLUÍDO COM SUCESSO!                ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
