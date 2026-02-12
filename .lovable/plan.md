

## Script de Instalacao Local (bootstrap-local.sh)

### O que sera criado

Um unico arquivo: `deploy/scripts/bootstrap-local.sh`

### Como funciona

1. Voce sobe os arquivos do projeto para a VPS (SCP, SFTP, ZIP, etc.)
2. Executa: `sudo bash /opt/sistema/deploy/scripts/bootstrap-local.sh`
3. O script faz todo o resto automaticamente

### O que o script faz internamente

1. Detecta o diretorio raiz do projeto (relativo a posicao do proprio script)
2. Valida que os arquivos essenciais existem (`docker-compose.yml`, `install-unified.sh`)
3. Instala Git se necessario (dependencia do install-unified)
4. Da permissao de execucao a todos os scripts em `deploy/scripts/`
5. Executa o `install-unified.sh` que ja cuida de tudo:
   - Instalar Docker
   - Perguntar dominio e email SSL
   - Configurar Nginx e certificado
   - Subir banco de dados
   - Criar usuario admin
   - Iniciar Baileys

### Secao tecnica

| Arquivo | Alteracao |
|---|---|
| `deploy/scripts/bootstrap-local.sh` | Novo script (~50 linhas) que reutiliza o install-unified.sh |

O script e simples: apenas resolve o caminho do projeto, valida os arquivos, e chama o instalador existente. Toda a logica complexa ja esta no `install-unified.sh`.

