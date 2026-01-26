

# Plano: Script de Instalação WAHA Independente para Revendedores

## Objetivo

Criar um script `install-waha.sh` automatizado e independente que cada revendedor pode executar em sua própria VPS para instalar o servidor WAHA (WhatsApp HTTP API). O script irá:

1. Perguntar o domínio do cliente durante a instalação
2. Configurar Docker e WAHA automaticamente
3. Gerar certificados SSL
4. Retornar a URL e API Key para configurar no sistema principal

---

## Arquitetura da Solução

```text
+-----------------------------------------------------------------------+
|                    FLUXO DE INSTALAÇÃO WAHA                           |
+-----------------------------------------------------------------------+
|                                                                       |
|   VPS DO CLIENTE                           SISTEMA PRINCIPAL          |
|   +---------------------------+            +-------------------+      |
|   |                           |            |                   |      |
|   |  1. Baixar script         |            |                   |      |
|   |     install-waha.sh       |            |                   |      |
|   |                           |            |                   |      |
|   |  2. Executar script       |            |                   |      |
|   |     - Perguntar domínio   |            |                   |      |
|   |     - Instalar Docker     |            |                   |      |
|   |     - Configurar WAHA     |            |                   |      |
|   |     - Gerar SSL           |            |                   |      |
|   |     - Gerar API Key       |            |                   |      |
|   |                           |            |                   |      |
|   |  3. Exibir credenciais:   |            |                   |      |
|   |     - URL: https://...    |  ------->  |  Configurar em    |      |
|   |     - API Key: xxxxx      |            |  Cloud > Secrets  |      |
|   |                           |            |  - WAHA_API_URL   |      |
|   |                           |            |  - WAHA_API_KEY   |      |
|   +---------------------------+            +-------------------+      |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## Arquivos a Criar

### 1. `deploy/waha/install-waha.sh`

Script principal de instalação standalone:

```bash
#!/bin/bash

# ============================================
# Instalação WAHA - WhatsApp HTTP API
# Script independente para VPS
# ============================================

# Funcionalidades:
# - Detectar e instalar Docker se necessário
# - Perguntar domínio do cliente
# - Perguntar email para SSL (Let's Encrypt)
# - Gerar API Key segura (32 caracteres hex)
# - Configurar docker-compose.yml para WAHA
# - Configurar nginx com proxy reverso e SSL
# - Configurar webhook URL (opcional)
# - Iniciar containers
# - Verificar saúde do serviço
# - Exibir credenciais finais
```

**Perguntas durante instalação:**
1. Domínio (ex: `waha.meucliente.com.br`)
2. Email para SSL (para Let's Encrypt)
3. URL do webhook (opcional - para receber mensagens)
4. Porta HTTP (padrão: 80)
5. Porta HTTPS (padrão: 443)

**Credenciais geradas automaticamente:**
- API Key: `openssl rand -hex 32`

---

### 2. `deploy/waha/docker-compose.yml`

Docker Compose simplificado apenas para WAHA:

```yaml
version: "3.8"

services:
  waha:
    image: devlikeapro/waha:latest
    container_name: waha
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      WHATSAPP_API_KEY: ${WAHA_API_KEY}
      WHATSAPP_HOOK_URL: ${WEBHOOK_URL:-}
      WHATSAPP_HOOK_EVENTS: "message,session.status"
      WHATSAPP_RESTART_ALL_SESSIONS: "true"
    volumes:
      - ./data/sessions:/app/.waha/sessions
      - ./data/media:/app/.waha/media
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    container_name: waha-proxy
    restart: unless-stopped
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - waha
```

---

### 3. `deploy/waha/nginx/nginx.conf.template`

Template de configuração nginx com SSL:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream waha_backend {
        server waha:3000;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name ${DOMAIN};
        return 301 https://$server_name$request_uri;
    }

    # HTTPS Server
    server {
        listen 443 ssl http2;
        server_name ${DOMAIN};

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        location / {
            proxy_pass http://waha_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

---

### 4. `deploy/waha/.env.example`

Template de variáveis de ambiente:

```env
# Domínio do servidor WAHA
DOMAIN=waha.exemplo.com.br

# API Key (gerada automaticamente)
WAHA_API_KEY=

# Email para SSL (Let's Encrypt)
SSL_EMAIL=

# URL do Webhook (onde enviar mensagens recebidas)
WEBHOOK_URL=

# Portas
HTTP_PORT=80
HTTPS_PORT=443
```

---

## Fluxo do Script de Instalação

### Passo 1: Verificação de Requisitos
- Verificar se é root/sudo
- Verificar/instalar Docker
- Verificar/instalar Docker Compose
- Verificar/instalar Certbot (para SSL)

### Passo 2: Coletar Informações
```text
============================================
  Instalação WAHA - WhatsApp HTTP API
  Versão: 1.0.0
============================================

Este script irá instalar o servidor WAHA em sua VPS.

Informe as configurações:

  Domínio do servidor (ex: waha.meusite.com.br): _______
  Email para SSL (Let's Encrypt): _______
  URL do Webhook (opcional, Enter para pular): _______
```

### Passo 3: Configuração Automática
- Criar diretórios necessários
- Gerar API Key segura
- Criar arquivo .env
- Processar templates (substituir variáveis)
- Gerar/obter certificado SSL

### Passo 4: Iniciar Serviços
- `docker-compose up -d`
- Aguardar containers iniciarem
- Verificar saúde do WAHA

### Passo 5: Exibir Resultado
```text
============================================
  Instalação Concluída com Sucesso!
============================================

  Seu servidor WAHA está funcionando!

  URL da API: https://waha.meusite.com.br
  API Key: a1b2c3d4e5f6g7h8i9j0...

  IMPORTANTE: Guarde a API Key em local seguro!

  Para conectar ao sistema principal:
  1. Acesse Cloud > Secrets
  2. Adicione as seguintes variáveis:
     - WAHA_API_URL = https://waha.meusite.com.br
     - WAHA_API_KEY = a1b2c3d4e5f6g7h8i9j0...

  Comandos úteis:
    Ver logs:     docker-compose logs -f
    Reiniciar:    docker-compose restart
    Parar:        docker-compose down
    Status:       curl https://waha.meusite.com.br/api/health

============================================
```

---

## Scripts Auxiliares

### `deploy/waha/scripts/backup.sh`
Script para backup das sessões WhatsApp

### `deploy/waha/scripts/update.sh`
Script para atualizar a imagem do WAHA

### `deploy/waha/scripts/uninstall.sh`
Script para remover a instalação

---

## Estrutura de Arquivos Final

```text
deploy/waha/
├── install-waha.sh           # Script principal de instalação
├── docker-compose.yml        # Configuração dos containers
├── .env.example              # Template de variáveis
├── nginx/
│   ├── nginx.conf.template   # Template do nginx (processado)
│   └── ssl/                  # Certificados SSL (gerados)
├── scripts/
│   ├── backup.sh             # Backup das sessões
│   ├── update.sh             # Atualizar WAHA
│   └── uninstall.sh          # Remover instalação
├── data/                     # (criado na instalação)
│   ├── sessions/             # Sessões WhatsApp
│   └── media/                # Arquivos de mídia
└── README.md                 # Documentação
```

---

## Instruções de Uso para Revendedores

1. **Requisitos mínimos da VPS:**
   - Ubuntu 22.04 ou Debian 12
   - 2GB RAM
   - 20GB SSD
   - IP público com domínio apontado

2. **Instalação:**
   ```bash
   # Baixar o script
   wget https://seusite.com/waha/install-waha.sh
   
   # Dar permissão
   chmod +x install-waha.sh
   
   # Executar
   sudo ./install-waha.sh
   ```

3. **Após instalação:**
   - Copiar URL e API Key exibidas
   - Configurar no sistema principal em Cloud > Secrets

---

## Resumo das Alterações

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `deploy/waha/install-waha.sh` | Criar | Script principal de instalação |
| `deploy/waha/docker-compose.yml` | Criar | Configuração Docker simplificada |
| `deploy/waha/.env.example` | Criar | Template de variáveis |
| `deploy/waha/nginx/nginx.conf.template` | Criar | Template nginx com SSL |
| `deploy/waha/scripts/backup.sh` | Criar | Script de backup |
| `deploy/waha/scripts/update.sh` | Criar | Script de atualização |
| `deploy/waha/scripts/uninstall.sh` | Criar | Script de remoção |
| `deploy/waha/README.md` | Criar | Documentação para revendedores |

