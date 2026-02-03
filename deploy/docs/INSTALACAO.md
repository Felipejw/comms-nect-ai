# Guia de Instalação - Sistema de Atendimento

Sistema de atendimento WhatsApp self-hosted com Supabase + Baileys WhatsApp Engine.

## Engines WhatsApp Suportadas

| Engine | Tipo | Descrição |
|--------|------|-----------|
| **Baileys** (Recomendado) | QR Code | Biblioteca JavaScript leve e rápida |
| WAHA | QR Code | WhatsApp HTTP API |
| WPPConnect | QR Code | Multi-instância com failover |

---

## Gerando o Pacote de Instalação

Antes de instalar na VPS, você precisa gerar o pacote no ambiente de desenvolvimento:

```bash
# No diretório raiz do projeto (onde está o package.json)
cd deploy
chmod +x scripts/*.sh
./scripts/package.sh
```

Isso irá:
1. Compilar o frontend (`npm run build`)
2. Copiar todos os arquivos necessários
3. Gerar dois arquivos em `releases/`:
   - `sistema-atendimento-vX.X.X.zip` - Instalação completa
   - `sistema-atendimento-vX.X.X-update.zip` - Apenas atualização

---

## Requisitos Mínimos

| Recurso | Mínimo | Recomendado | Alta Disponibilidade |
|---------|--------|-------------|----------------------|
| RAM | 4GB | 8GB | 16GB |
| CPU | 2 vCPUs | 4 vCPUs | 8 vCPUs |
| Disco | 40GB SSD | 80GB SSD | 160GB SSD |
| Sistema | Ubuntu 22.04 / Debian 12 | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

---

## Instalação Unificada (Baileys + Sistema Completo)

### Opção 1: Instalação Rápida (Uma Linha)

```bash
curl -fsSL https://raw.githubusercontent.com/seu-repo/sistema/main/deploy/scripts/install-unified.sh | sudo bash
```

### Opção 2: Instalação Manual

```bash
# Baixar o pacote
wget https://seu-servidor/releases/sistema-atendimento-vX.X.X.zip

# Extrair
unzip sistema-atendimento-vX.X.X.zip
cd sistema-atendimento-vX.X.X

# Dar permissão aos scripts
chmod +x scripts/*.sh

# Executar instalação unificada
sudo ./scripts/install-unified.sh
```

### O Que a Instalação Faz Automaticamente

1. ✅ Verifica e instala Docker se necessário
2. ✅ **Detecta instalação Baileys existente** e migra sessões
3. ✅ Gera certificados SSL (Let's Encrypt ou auto-assinado)
4. ✅ Configura banco de dados PostgreSQL
5. ✅ Configura autenticação (GoTrue)
6. ✅ Configura API Gateway (Kong)
7. ✅ Configura Edge Functions
8. ✅ Integra Baileys WhatsApp Server
9. ✅ Inicia todos os serviços Docker
10. ✅ Verifica saúde de todos os componentes

---

## Migrando de Baileys Standalone

Se você já tem o Baileys instalado separadamente, o script de instalação unificada:

1. **Detecta automaticamente** a instalação existente em `/opt/baileys`, `/root/baileys` ou `$HOME/baileys`
2. **Migra as sessões WhatsApp** existentes para o novo volume
3. **Preserva a API Key** existente
4. **Para o Baileys standalone** antes de iniciar o unificado

**Suas sessões WhatsApp serão mantidas!** Não será necessário escanear QR Code novamente.

---

## Pós-Instalação

1. Acesse `https://seu-dominio.com`
2. Faça login com o admin criado
3. Vá em **Conexões** e adicione uma instância WhatsApp
4. Escaneie o QR Code com seu celular

---

## Arquitetura Unificada

```
SUA VPS (Tudo em uma única máquina)
+------------------------------------------------------------------+
|                                                                  |
|  NGINX (porta 80/443)                                           |
|  +------------------------------------------------------------+ |
|  |  / → Frontend React                                        | |
|  |  /rest/v1/ → PostgREST (API)                              | |
|  |  /auth/v1/ → GoTrue (Autenticação)                        | |
|  |  /storage/v1/ → Storage API                               | |
|  |  /functions/v1/ → Edge Functions                          | |
|  |  /baileys/ → Baileys WhatsApp Server                      | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  SUPABASE (containers Docker)                                   |
|  +--------------------+  +--------------------+                 |
|  |  PostgreSQL 15     |  |  GoTrue (Auth)     |                |
|  +--------------------+  +--------------------+                 |
|  +--------------------+  +--------------------+                 |
|  |  PostgREST (API)   |  |  Storage API       |                |
|  +--------------------+  +--------------------+                 |
|  +--------------------+  +--------------------+                 |
|  |  Edge Functions    |  |  Realtime (WS)     |                |
|  +--------------------+  +--------------------+                 |
|  +--------------------+                                         |
|  |  Kong Gateway      |                                        |
|  +--------------------+                                         |
|                                                                  |
|  WHATSAPP ENGINE                                                |
|  +--------------------+                                         |
|  |  Baileys Server    |                                        |
|  +--------------------+                                         |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Configuração de Variáveis

No arquivo `.env`:

```env
# Engine WhatsApp (baileys, waha, ou wppconnect)
WHATSAPP_ENGINE=baileys

# Baileys Config (integrado)
BAILEYS_API_KEY=sua-api-key-gerada
BAILEYS_INTERNAL_URL=http://baileys:3000
BAILEYS_EXTERNAL_URL=https://seu-dominio.com/baileys

# Webhook (interno via Kong)
WEBHOOK_URL=http://kong:8000/functions/v1/baileys-webhook
```

---

## Comandos Úteis

```bash
# Ver logs em tempo real (todos os serviços)
docker compose --profile baileys logs -f

# Ver logs de um serviço específico
docker compose --profile baileys logs -f baileys
docker compose --profile baileys logs -f nginx
docker compose --profile baileys logs -f db

# Reiniciar todos os serviços
docker compose --profile baileys restart

# Reiniciar um serviço específico
docker compose --profile baileys restart baileys

# Parar todos os serviços
docker compose --profile baileys down

# Iniciar serviços
docker compose --profile baileys up -d

# Ver status dos containers
docker compose --profile baileys ps

# Backup manual
./scripts/backup.sh

# Restaurar backup
./scripts/restore.sh backups/nome-do-backup.tar.gz

# Verificar saúde do Baileys
curl http://localhost:3000/health
curl https://seu-dominio.com/baileys/health
```

---

## Estrutura de Arquivos

```
sistema-atendimento/
├── docker-compose.yml     # Orquestração principal
├── .env                   # Configurações (gerado na instalação)
├── .env.example           # Template de configuração
├── VERSION                # Versão instalada
├── CHANGELOG.md           # Histórico de alterações
├── baileys/               # Código fonte do Baileys
│   ├── Dockerfile         # Build do container
│   ├── src/               # Código TypeScript
│   └── package.json       # Dependências
├── nginx/
│   ├── nginx.conf         # Configuração do proxy reverso
│   └── ssl/               # Certificados SSL
├── scripts/
│   ├── install-unified.sh # Instalação unificada
│   ├── install.sh         # Instalação básica
│   ├── backup.sh          # Backup
│   ├── update.sh          # Atualização
│   └── restore.sh         # Restauração
├── frontend/
│   └── dist/              # Frontend compilado
├── supabase/
│   └── init.sql           # Migrations do banco
├── volumes/
│   ├── db/                # Dados PostgreSQL
│   ├── storage/           # Arquivos enviados
│   ├── kong/              # Config API Gateway
│   └── baileys/           # Sessões WhatsApp
│       └── sessions/      # Sessões persistidas
├── backups/               # Backups automáticos
└── docs/
    └── INSTALACAO.md      # Esta documentação
```

---

## Troubleshooting

### Erro de conexão com banco

```bash
docker compose --profile baileys logs db
docker compose --profile baileys restart db
```

### WhatsApp não conecta

1. Verifique se Baileys está rodando:
   ```bash
   docker compose --profile baileys ps | grep baileys
   ```

2. Verifique os logs:
   ```bash
   docker compose --profile baileys logs baileys
   ```

3. Verifique a saúde do serviço:
   ```bash
   curl http://localhost:3000/health
   ```

4. Confirme webhook configurado no .env:
   ```bash
   grep WEBHOOK_URL .env
   ```

5. Reinicie o serviço se necessário:
   ```bash
   docker compose --profile baileys restart baileys
   ```

### QR Code não aparece

1. Verifique se a sessão foi iniciada:
   ```bash
   docker compose --profile baileys logs baileys | grep -i qr
   ```

2. Limpe sessões antigas se necessário:
   ```bash
   rm -rf volumes/baileys/sessions/*
   docker compose --profile baileys restart baileys
   ```

### Frontend não carrega

1. Verifique nginx: `docker compose --profile baileys logs nginx`
2. Verifique se frontend/dist existe e tem arquivos
3. Reinicie nginx: `docker compose --profile baileys restart nginx`

### Certificado SSL

```bash
# Para domínios públicos, renovar Let's Encrypt
sudo certbot renew
cp /etc/letsencrypt/live/$DOMAIN/* nginx/ssl/
docker compose --profile baileys restart nginx
```

### Verificar versão instalada

```bash
cat VERSION
```

---

## Configuração do Baileys

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `BAILEYS_API_KEY` | Chave de autenticação da API | Obrigatório |
| `BAILEYS_INTERNAL_URL` | URL interna via Docker | http://baileys:3000 |
| `BAILEYS_EXTERNAL_URL` | URL externa via proxy | https://dominio/baileys |
| `WEBHOOK_URL` | URL para receber eventos | http://kong:8000/functions/v1/baileys-webhook |
| `LOG_LEVEL` | Nível de log | info |

### Endpoints Principais

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Status do servidor |
| `/sessions` | GET | Listar sessões |
| `/sessions/:id/start` | POST | Iniciar sessão (gera QR) |
| `/sessions/:id/qr` | GET | Obter QR Code |
| `/sessions/:id/status` | GET | Status da sessão |
| `/sessions/:id/send` | POST | Enviar mensagem |
| `/sessions/:id/disconnect` | POST | Desconectar sessão |

### Headers de Autenticação

```bash
# Todas as requisições precisam do header:
x-api-key: sua-api-key
```

---

## Capacidade Estimada

| Modo | Conexões WhatsApp | Mensagens/dia |
|------|-------------------|---------------|
| Baileys (único) | 5-10 | ~20.000 |
| Multi-Engine | 10-20 | ~50.000 |

*Valores aproximados, dependem do hardware e uso.*

---

## Suporte

Para dúvidas e suporte, entre em contato com o desenvolvedor.

**Versão da documentação:** 3.0.0  
**Engine WhatsApp:** Baileys (Unificado)
