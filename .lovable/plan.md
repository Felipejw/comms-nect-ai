

## Corrigir conflito de container Baileys na reinstalacao

### Problema
Dois bugs causam o erro "container name /baileys-server is already in use":

1. **bootstrap-local.sh**: O `docker compose down` na limpeza da instalacao anterior nao inclui `--profile baileys`, entao o container do Baileys nunca e parado/removido antes da reinstalacao.
2. **install-unified.sh**: O `docker compose --profile baileys up -d` na Etapa 3 nao usa `--force-recreate`, entao se um container com o mesmo nome ja existe (de uma instalacao standalone anterior ou reinstalacao), o Docker recusa criar um novo.

Isso faz o Nginx tambem falhar ao subir, resultando em ERR_CONNECTION_REFUSED no navegador.

### Solucao

**Arquivo 1: `deploy/scripts/bootstrap-local.sh`**
- Adicionar `--profile baileys` ao comando `docker compose down` na secao de backup
- Adicionar um `docker rm -f baileys-server` como fallback para remover containers orfaos

**Arquivo 2: `deploy/scripts/install-unified.sh`**
- Adicionar `--force-recreate --remove-orphans` ao comando da Etapa 3 (linha 892)
- Adicionar uma limpeza preventiva de containers orfaos no inicio da funcao `start_services()`

### Detalhes tecnicos

**bootstrap-local.sh** - Secao de backup (linhas 137-143):
```bash
# Antes (nao para o baileys):
docker compose down

# Depois:
docker compose --profile baileys down --remove-orphans
docker rm -f baileys-server 2>/dev/null || true
```

**install-unified.sh** - Funcao start_services (linha 892):
```bash
# Antes:
docker compose --profile baileys up -d || true

# Depois:
docker rm -f baileys-server 2>/dev/null || true
docker compose --profile baileys up -d --force-recreate --remove-orphans || true
```

### Comando para corrigir agora na VPS (sem precisar reinstalar)
Voce pode rodar isso agora para desbloquear:
```text
cd /opt/sistema/deploy
docker rm -f baileys-server
docker compose --profile baileys up -d --force-recreate
```

