# WAHA - WhatsApp HTTP API

Script de instalação automatizada do servidor WAHA para revendedores.

## 📋 Requisitos Mínimos

- **Sistema Operacional:** Ubuntu 22.04 LTS ou Debian 12
- **RAM:** 2GB mínimo (4GB recomendado)
- **Disco:** 20GB SSD
- **CPU:** 1 vCPU (2 vCPUs recomendado)
- **Rede:** IP público com porta 80 e 443 liberadas
- **DNS:** Domínio apontando para o IP do servidor

## 🚀 Instalação Rápida

```bash
# 1. Baixar o script de instalação
wget https://seu-site.com/waha/install-waha.sh

# 2. Dar permissão de execução
chmod +x install-waha.sh

# 3. Executar como root
sudo ./install-waha.sh
```

## 📝 Durante a Instalação

O script irá perguntar:

1. **Domínio do servidor** (ex: `waha.meusite.com.br`)
2. **Email para SSL** (para certificado Let's Encrypt)
3. **URL do Webhook** (opcional - para receber mensagens)

## ✅ Após a Instalação

O script exibirá as credenciais:

```
URL da API: https://waha.meusite.com.br
API Key: a1b2c3d4e5f6g7h8i9j0...
```

### Configurar no Sistema Principal

1. Acesse **Cloud > Secrets** no sistema principal
2. Adicione as variáveis:
   - `WAHA_API_URL` = `https://waha.meusite.com.br`
   - `WAHA_API_KEY` = `sua-api-key-gerada`

## 🔧 Comandos Úteis

```bash
# Ver logs em tempo real
cd /opt/waha && docker-compose logs -f

# Ver logs do WAHA apenas
cd /opt/waha && docker-compose logs -f waha

# Reiniciar serviços
cd /opt/waha && docker-compose restart

# Parar serviços
cd /opt/waha && docker-compose down

# Iniciar serviços
cd /opt/waha && docker-compose up -d

# Verificar status
/opt/waha/scripts/status.sh

# Fazer backup
/opt/waha/scripts/backup.sh

# Atualizar WAHA
/opt/waha/scripts/update.sh

# Desinstalar
/opt/waha/scripts/uninstall.sh
```

## 📊 Dashboard WAHA

Acesse o dashboard de administração:

- **URL:** `https://seu-dominio.com.br/dashboard`
- **Usuário:** `admin`
- **Senha:** Sua API Key

## 🔐 Segurança

- A API Key é gerada automaticamente com 64 caracteres hexadecimais
- Certificado SSL é renovado automaticamente via cron
- Todas as comunicações são criptografadas via HTTPS
- O arquivo `.env` tem permissões restritas (600)

## 📁 Estrutura de Diretórios

```
/opt/waha/
├── docker-compose.yml    # Configuração dos containers
├── .env                  # Variáveis de ambiente
├── CREDENCIAIS.txt       # Credenciais (chmod 600)
├── nginx/
│   ├── nginx.conf        # Configuração do proxy
│   └── ssl/              # Certificados SSL
├── data/
│   ├── sessions/         # Sessões WhatsApp
│   └── media/            # Arquivos de mídia
├── scripts/
│   ├── backup.sh         # Script de backup
│   ├── update.sh         # Script de atualização
│   ├── uninstall.sh      # Script de desinstalação
│   └── status.sh         # Script de status
└── backups/              # Backups automáticos
```

## 🔄 Backup Automático

Configure backup automático no cron:

```bash
# Backup diário às 2h da manhã
0 2 * * * /opt/waha/scripts/backup.sh >> /var/log/waha-backup.log 2>&1
```

Os backups são mantidos por 7 dias automaticamente.

## 🐛 Solução de Problemas

### WAHA não inicia

```bash
# Verificar logs
docker logs waha

# Verificar se a porta 3000 está livre
netstat -tlnp | grep 3000
```

### Erro de SSL

```bash
# Verificar certificado
openssl s_client -connect seu-dominio.com:443

# Renovar manualmente
certbot renew --force-renewal
```

### Sessão desconectada

1. Acesse o dashboard: `https://seu-dominio.com.br/dashboard`
2. Delete a sessão antiga
3. Crie uma nova sessão
4. Escaneie o QR Code

## 📞 Suporte

- **Documentação WAHA:** https://waha.devlike.pro/docs
- **GitHub WAHA:** https://github.com/devlikeapro/waha

## 📄 Licença

Este script é fornecido "como está", sem garantias. Use por sua conta e risco.
