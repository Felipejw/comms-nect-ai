#!/bin/bash

# ============================================
# Script de Empacotamento - Sistema de Atendimento
# Gera o pacote ZIP para distribuição
# ============================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

# Diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$DEPLOY_DIR")"

# Ler versão
VERSION=$(cat "$DEPLOY_DIR/VERSION" 2>/dev/null || echo "3.0.0")

echo -e "${BLUE}"
echo "============================================"
echo "  Empacotamento - Sistema de Atendimento"
echo "  Versão: $VERSION"
echo "============================================"
echo -e "${NC}"

# ==========================================
# 1. Verificar Node.js
# ==========================================
if ! command -v node &> /dev/null; then
    log_error "Node.js não encontrado. Instale o Node.js 20 ou superior."
    exit 1
fi

# ==========================================
# 2. Build do Frontend
# ==========================================
log_info "Construindo frontend..."

cd "$PROJECT_DIR"

# Criar .env temporário para build (valores placeholder)
cat > .env.build << EOF
VITE_SUPABASE_URL=https://DOMAIN_PLACEHOLDER
VITE_SUPABASE_PUBLISHABLE_KEY=KEY_PLACEHOLDER
VITE_SUPABASE_PROJECT_ID=self-hosted
EOF

# Usar .env.build para o build
cp .env.build .env.temp
if [ -f .env ]; then
    mv .env .env.original
fi
mv .env.temp .env

# Instalar dependências e fazer build
npm install
npm run build

# Restaurar .env original se existia
if [ -f .env.original ]; then
    mv .env.original .env
else
    rm .env
fi
rm -f .env.build

# Limpar pasta de destino e copiar build
rm -rf "$DEPLOY_DIR/frontend/dist"/*
cp -r dist/* "$DEPLOY_DIR/frontend/dist/"

cd "$DEPLOY_DIR"

log_success "Frontend construído"

# ==========================================
# 3. Criar Pacote de Instalação Completa
# ==========================================
log_info "Criando pacote de instalação..."

PACKAGE_NAME="chatbot-v${VERSION}"
PACKAGE_DIR="/tmp/$PACKAGE_NAME"
OUTPUT_DIR="$PROJECT_DIR/releases"

# Criar diretório de saída
mkdir -p "$OUTPUT_DIR"

# Limpar diretório temporário
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Copiar arquivos necessários
cp docker-compose.yml "$PACKAGE_DIR/"
cp .env.example "$PACKAGE_DIR/"
cp -r nginx "$PACKAGE_DIR/"
cp -r scripts "$PACKAGE_DIR/"
cp -r supabase "$PACKAGE_DIR/"
cp -r docs "$PACKAGE_DIR/"
cp -r frontend "$PACKAGE_DIR/"
cp -r baileys "$PACKAGE_DIR/"
cp VERSION "$PACKAGE_DIR/"
cp CHANGELOG.md "$PACKAGE_DIR/" 2>/dev/null || true

# Criar estrutura de diretórios vazios
mkdir -p "$PACKAGE_DIR/volumes/db/data"
mkdir -p "$PACKAGE_DIR/volumes/db/init"
mkdir -p "$PACKAGE_DIR/volumes/storage"
mkdir -p "$PACKAGE_DIR/volumes/kong"
mkdir -p "$PACKAGE_DIR/volumes/baileys/sessions"
mkdir -p "$PACKAGE_DIR/backups"

# Criar .gitkeep para manter estrutura
touch "$PACKAGE_DIR/volumes/db/data/.gitkeep"
touch "$PACKAGE_DIR/volumes/db/init/.gitkeep"
touch "$PACKAGE_DIR/volumes/storage/.gitkeep"
touch "$PACKAGE_DIR/volumes/kong/.gitkeep"
touch "$PACKAGE_DIR/volumes/baileys/sessions/.gitkeep"
touch "$PACKAGE_DIR/backups/.gitkeep"

# Copiar bootstrap-local.sh para a raiz do pacote (fora da subpasta)
cp "$DEPLOY_DIR/scripts/bootstrap-local.sh" "$PACKAGE_DIR/bootstrap-local.sh"

# Criar ZIP
cd /tmp
rm -f "$OUTPUT_DIR/${PACKAGE_NAME}.zip"
zip -r "$OUTPUT_DIR/${PACKAGE_NAME}.zip" "$PACKAGE_NAME"

# Também copiar bootstrap-local.sh solto no releases/ para conveniência
cp "$DEPLOY_DIR/scripts/bootstrap-local.sh" "$OUTPUT_DIR/bootstrap-local.sh"

# Limpar
rm -rf "$PACKAGE_DIR"

log_success "Pacote criado: $OUTPUT_DIR/${PACKAGE_NAME}.zip"

# ==========================================
# 4. Criar Pacote de Atualização (menor)
# ==========================================
log_info "Criando pacote de atualização..."

UPDATE_PACKAGE_NAME="chatbot-v${VERSION}-update"
UPDATE_PACKAGE_DIR="/tmp/$UPDATE_PACKAGE_NAME"

rm -rf "$UPDATE_PACKAGE_DIR"
mkdir -p "$UPDATE_PACKAGE_DIR"

# Copiar apenas arquivos que mudam em updates
cp -r scripts "$UPDATE_PACKAGE_DIR/"
cp -r frontend "$UPDATE_PACKAGE_DIR/"
cp -r nginx "$UPDATE_PACKAGE_DIR/"
cp -r docs "$UPDATE_PACKAGE_DIR/"
cp docker-compose.yml "$UPDATE_PACKAGE_DIR/"
cp VERSION "$UPDATE_PACKAGE_DIR/"
cp CHANGELOG.md "$UPDATE_PACKAGE_DIR/"

# Se houver migrations de update, copiar
if [ -d "supabase/migrations_update" ]; then
    mkdir -p "$UPDATE_PACKAGE_DIR/supabase"
    cp -r supabase/migrations_update "$UPDATE_PACKAGE_DIR/supabase/"
fi

# Criar arquivo de instruções
cat > "$UPDATE_PACKAGE_DIR/LEIA-ME.txt" << 'EOF'
INSTRUÇÕES DE ATUALIZAÇÃO
==========================

1. Faça backup antes de atualizar:
   ./scripts/backup.sh

2. Extraia este arquivo sobre sua instalação existente:
   unzip -o sistema-atendimento-vX.X-update.zip -d /caminho/da/instalacao/

3. Execute o script de atualização:
   cd /caminho/da/instalacao
   ./scripts/update.sh

4. Verifique se tudo está funcionando:
   docker compose --profile baileys ps
   docker compose logs -f

Em caso de problemas, restaure o backup:
   ./scripts/restore.sh backups/backup-XXXXXX.tar.gz
EOF

# Criar ZIP de update
cd /tmp
rm -f "$OUTPUT_DIR/${UPDATE_PACKAGE_NAME}.zip"
zip -r "$OUTPUT_DIR/${UPDATE_PACKAGE_NAME}.zip" "$UPDATE_PACKAGE_NAME"

# Limpar
rm -rf "$UPDATE_PACKAGE_DIR"

log_success "Pacote de atualização criado: $OUTPUT_DIR/${UPDATE_PACKAGE_NAME}.zip"

# ==========================================
# 5. Resumo
# ==========================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Empacotamento Concluído!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Pacotes gerados em: $OUTPUT_DIR/"
echo ""
echo "  📦 ${PACKAGE_NAME}.zip"
echo "     Instalação completa para novos clientes"
echo ""
echo "  📦 ${UPDATE_PACKAGE_NAME}.zip"
echo "     Atualização para clientes existentes"
echo ""
echo -e "${YELLOW}Próximos passos:${NC}"
echo "  1. Teste a instalação em um ambiente limpo"
echo "  2. Teste a atualização em um ambiente existente"
echo "  3. Distribua os pacotes para seus clientes"
echo ""
