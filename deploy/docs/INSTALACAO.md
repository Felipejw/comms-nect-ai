# Guia de Instalação - Sistema de Atendimento

Sistema de atendimento WhatsApp self-hosted com Supabase + Evolution API.

## Requisitos Mínimos

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| RAM | 4GB | 8GB |
| CPU | 2 vCPUs | 4 vCPUs |
| Disco | 40GB SSD | 80GB SSD |
| Sistema | Ubuntu 22.04 / Debian 12 | Ubuntu 22.04 LTS |

## Instalação Rápida

```bash
# 1. Clone o repositório
git clone <seu-repositorio> sistema-atendimento
cd sistema-atendimento/deploy

# 2. Execute o instalador
chmod +x scripts/*.sh
./scripts/install.sh
```

## Instalação Manual

### 1. Instalar Dependências

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Configurar Ambiente

```bash
cd deploy
cp .env.example .env
nano .env  # Edite as configurações
```

### 3. Gerar Chaves JWT

```bash
# Gerar JWT_SECRET
openssl rand -hex 32

# As chaves ANON_KEY e SERVICE_ROLE_KEY serão geradas pelo install.sh
```

### 4. Build do Frontend

```bash
cd ..  # Voltar para raiz do projeto
npm install
npm run build
cp -r dist/* deploy/frontend/dist/
```

### 5. Iniciar Sistema

```bash
cd deploy
docker-compose up -d
```

## Pós-Instalação

1. Acesse `https://seu-dominio.com`
2. Faça login com o admin criado
3. Vá em **Conexões** e adicione uma instância WhatsApp
4. Escaneie o QR Code com seu celular

## Comandos Úteis

```bash
# Ver logs
docker-compose logs -f

# Reiniciar serviços
docker-compose restart

# Parar tudo
docker-compose down

# Backup
./scripts/backup.sh

# Atualizar
./scripts/update.sh

# Restaurar
./scripts/restore.sh
```

## Estrutura de Arquivos

```
deploy/
├── docker-compose.yml     # Orquestração principal
├── .env.example           # Template de configuração
├── nginx/
│   └── nginx.conf         # Proxy reverso
├── scripts/
│   ├── install.sh         # Instalação automática
│   ├── backup.sh          # Backup
│   ├── update.sh          # Atualização
│   └── restore.sh         # Restauração
├── volumes/
│   ├── db/                # Dados PostgreSQL
│   ├── storage/           # Arquivos enviados
│   ├── kong/              # Config API Gateway
│   └── evolution/         # Sessões WhatsApp
└── docs/
    └── INSTALACAO.md      # Esta documentação
```

## Troubleshooting

### Erro de conexão com banco
```bash
docker-compose logs db
docker-compose restart db
```

### WhatsApp não conecta
1. Verifique se Evolution está rodando: `docker-compose ps evolution`
2. Verifique os logs: `docker-compose logs evolution`
3. Confirme webhook configurado no .env

### Certificado SSL
```bash
# Renovar Let's Encrypt
sudo certbot renew
cp /etc/letsencrypt/live/$DOMAIN/* deploy/nginx/ssl/
docker-compose restart nginx
```

## Suporte

Para dúvidas e suporte, entre em contato com o desenvolvedor.
