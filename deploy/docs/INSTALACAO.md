# Guia de Instalação - Sistema de Atendimento

Sistema de atendimento WhatsApp self-hosted com Supabase + Evolution API.

## Requisitos Mínimos

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| RAM | 4GB | 8GB |
| CPU | 2 vCPUs | 4 vCPUs |
| Disco | 40GB SSD | 80GB SSD |
| Sistema | Ubuntu 22.04 / Debian 12 | Ubuntu 22.04 LTS |

## Instalação

### Passo 1: Baixar o Pacote

Baixe o arquivo `sistema-atendimento-vX.X.X.zip` fornecido pelo desenvolvedor.

### Passo 2: Extrair e Instalar

```bash
# Extrair o pacote
unzip sistema-atendimento-vX.X.X.zip
cd sistema-atendimento-vX.X.X

# Dar permissão aos scripts
chmod +x scripts/*.sh

# Executar instalação
./scripts/install.sh
```

### Passo 3: Seguir o Assistente

O script de instalação irá:
1. Verificar e instalar Docker se necessário
2. Solicitar seu domínio/IP
3. Gerar certificados SSL
4. Configurar o banco de dados
5. Criar usuário administrador

## Pós-Instalação

1. Acesse `https://seu-dominio.com`
2. Faça login com o admin criado
3. Vá em **Conexões** e adicione uma instância WhatsApp
4. Escaneie o QR Code com seu celular

---

## Atualizações

### Como Atualizar

1. **Faça backup antes de atualizar:**
   ```bash
   ./scripts/backup.sh
   ```

2. **Baixe o pacote de atualização** fornecido pelo desenvolvedor
   (arquivo `sistema-atendimento-vX.X-update.zip`)

3. **Extraia sobre a instalação existente:**
   ```bash
   cd /caminho/da/sua/instalacao
   unzip -o /caminho/do/sistema-atendimento-vX.X-update.zip
   ```

4. **Execute o script de atualização:**
   ```bash
   ./scripts/update.sh
   ```

5. **Verifique se está funcionando:**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

### Em Caso de Problemas

Se algo der errado após a atualização, restaure o backup:

```bash
./scripts/restore.sh backups/backup-XXXXXX.tar.gz
```

---

## Comandos Úteis

```bash
# Ver logs em tempo real
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f nginx
docker-compose logs -f db
docker-compose logs -f evolution

# Reiniciar todos os serviços
docker-compose restart

# Reiniciar um serviço específico
docker-compose restart nginx

# Parar todos os serviços
docker-compose down

# Iniciar serviços
docker-compose up -d

# Ver status dos containers
docker-compose ps

# Backup manual
./scripts/backup.sh

# Restaurar backup
./scripts/restore.sh backups/nome-do-backup.tar.gz
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
├── nginx/
│   ├── nginx.conf         # Configuração do proxy reverso
│   └── ssl/               # Certificados SSL
├── scripts/
│   ├── install.sh         # Instalação automática
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
│   └── evolution/         # Sessões WhatsApp
├── backups/               # Backups automáticos
└── docs/
    └── INSTALACAO.md      # Esta documentação
```

---

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

### Frontend não carrega
1. Verifique nginx: `docker-compose logs nginx`
2. Verifique se frontend/dist existe e tem arquivos
3. Reinicie nginx: `docker-compose restart nginx`

### Certificado SSL
```bash
# Para domínios públicos, renovar Let's Encrypt
sudo certbot renew
cp /etc/letsencrypt/live/$DOMAIN/* nginx/ssl/
docker-compose restart nginx
```

### Verificar versão instalada
```bash
cat VERSION
```

### Ver changelog
```bash
cat CHANGELOG.md
```

---

## Suporte

Para dúvidas e suporte, entre em contato com o desenvolvedor.

**Versão da documentação:** 1.0.0
