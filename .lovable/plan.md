# Plano: Corrigir Verificação de Saúde do Kong

## Status: ✅ IMPLEMENTADO

## Problema Identificado

Todas as 30 tentativas de verificação do Kong retornavam `HTTP: 000000` porque:
1. O Kong não estava pronto quando o health check começava
2. Os serviços dependentes (auth, rest) ainda estavam inicializando
3. O script não verificava containers antes do health check

## Solução Implementada

### Alterações em `deploy/scripts/install.sh`:

1. **Verificação de Containers Críticos**: Adicionada função `check_container_running()` que verifica se db, auth, rest e kong estão "Up"

2. **Health Check Multi-Estágio**:
   - Primeiro verifica se Kong responde (endpoint `/`)
   - Depois verifica se Auth está pronto (`/auth/v1/health`)
   - Mostra status de cada serviço separadamente

3. **Timeouts Aumentados**:
   - 60 tentativas (antes 30)
   - 3 segundos entre tentativas (antes 2)
   - Sleep inicial dividido em 30s + verificação + 30s

4. **Melhor Diagnóstico**:
   - Exibe `$DOCKER_COMPOSE ps` após containers iniciarem
   - Mensagens claras sobre qual serviço está aguardando
   - Sugestão de comando para debug se falhar

## Próximos Passos

1. Fazer commit/push das alterações para o GitHub
2. Re-executar instalação no servidor:
   ```bash
   cd ~
   sudo rm -rf comms-nect-ai
   git clone https://github.com/Felipejw/comms-nect-ai.git
   cd comms-nect-ai/deploy
   chmod +x scripts/*.sh
   sudo ./scripts/install.sh
   ```
