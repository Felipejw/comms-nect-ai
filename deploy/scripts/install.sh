#!/bin/bash

# ============================================
# REDIRECIONAMENTO para install-unified.sh
# ============================================
# Este script foi descontinuado em favor do install-unified.sh
# que é mais robusto e unifica a instalação do sistema completo.
# Mantido apenas para compatibilidade com documentação antiga.
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "============================================"
echo "  AVISO: install.sh foi substituído por"
echo "  install-unified.sh (mais robusto)"
echo ""
echo "  Redirecionando automaticamente..."
echo "============================================"
echo ""

exec bash "$SCRIPT_DIR/install-unified.sh" "$@"
