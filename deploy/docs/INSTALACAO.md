# Guia de Instalação - Sistema de Atendimento

Sistema de atendimento WhatsApp self-hosted com Supabase + WPPConnect Server.

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

## Requisitos Mínimos

| Recurso | Mínimo | Recomendado | Alta Disponibilidade |
|---------|--------|-------------|----------------------|
| RAM | 4GB | 8GB | 16GB |
| CPU | 2 vCPUs | 4 vCPUs | 8 vCPUs |
| Disco | 40GB SSD | 80GB SSD | 160GB SSD |
| Sistema | Ubuntu 22.04 / Debian 12 | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

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
5. Iniciar o WPPConnect Server
6. Verificar saúde de todos os serviços
7. Criar usuário administrador

## Pós-Instalação

1. Acesse `https://seu-dominio.com`
2. Faça login com o admin criado
3. Vá em **Conexões** e adicione uma instância WhatsApp
4. Escaneie o QR Code com seu celular

---

## Multi-Instância (Alta Disponibilidade)

O sistema suporta múltiplas instâncias WPPConnect para alta disponibilidade e balanceamento de carga.

### Modos de Operação

| Modo | Instâncias | Uso |
|------|------------|-----|
| **Padrão** | 1 | Uso normal, até 10 conexões |
| **Multi-Instance** | 2 | Maior capacidade, failover básico |
| **High-Availability** | 3 + Load Balancer | Máxima disponibilidade |

### Ativando Multi-Instância

```bash
# Modo com 2 instâncias
docker-compose --profile multi-instance up -d

# Modo alta disponibilidade (3 instâncias + load balancer)
docker-compose --profile multi-instance --profile high-availability up -d
```

### Configuração de Variáveis

No arquivo `.env`:

```env
# Instância primária (sempre ativa)
WPPCONNECT_PORT_1=21465
WPPCONNECT_API_URL=http://wppconnect-1:21465

# Instância secundária
WPPCONNECT_PORT_2=21466
WPPCONNECT_API_URL_2=http://wppconnect-2:21465

# Instância terciária
WPPCONNECT_PORT_3=21467
WPPCONNECT_API_URL_3=http://wppconnect-3:21465

# Load Balancer (porta unificada)
WPPCONNECT_LB_PORT=21400
WPPCONNECT_LB_URL=http://wppconnect-lb:80
```

### Verificando Status das Instâncias

```bash
# Ver status de todas as instâncias
docker-compose ps | grep wppconnect

# Verificar saúde individual
curl http://localhost:21465/api/   # Instância 1
curl http://localhost:21466/api/   # Instância 2
curl http://localhost:21467/api/   # Instância 3
curl http://localhost:21400/health # Load Balancer
```

### Comportamento do Load Balancer

- **Algoritmo**: Least Connections (menos conexões ativas)
- **Failover automático**: Se uma instância falhar, o tráfego é redirecionado
- **Health checks**: Verificação a cada 30 segundos
- **Retry**: 3 tentativas antes de marcar como indisponível

### Migração de Conexões

Se uma instância ficar indisponível, o sistema automaticamente:
1. Detecta a falha no health check
2. Seleciona a próxima instância saudável
3. Migra a sessão para a nova instância
4. O usuário precisará escanear o QR Code novamente

---

## Atualizações

### Como Atualizar

1. **Faça backup antes de atualizar:**
   ```bash
   ./scripts/backup.sh
   ```

2. **Baixe o pacote de atualização** fornecido pelo desenvolvedor

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
docker-compose logs -f wppconnect-1
docker-compose logs -f wppconnect-2
docker-compose logs -f wppconnect-lb

# Reiniciar todos os serviços
docker-compose restart

# Reiniciar um serviço específico
docker-compose restart nginx
docker-compose restart wppconnect-1

# Parar todos os serviços
docker-compose down

# Iniciar serviços (modo padrão)
docker-compose up -d

# Iniciar com multi-instância
docker-compose --profile multi-instance up -d

# Iniciar com alta disponibilidade
docker-compose --profile multi-instance --profile high-availability up -d

# Ver status dos containers
docker-compose ps

# Backup manual
./scripts/backup.sh

# Restaurar backup
./scripts/restore.sh backups/nome-do-backup.tar.gz

# Verificar saúde do WPPConnect (cada instância)
curl http://localhost:21465/api/health
curl http://localhost:21466/api/health
curl http://localhost:21467/api/health
curl http://localhost:21400/lb-status
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
│   ├── wppconnect-lb.conf # Config do Load Balancer
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
│   ├── wppconnect-1/      # Sessões WhatsApp (instância 1)
│   │   ├── tokens/        # Tokens de sessão
│   │   └── userDataDir/   # Dados do navegador
│   ├── wppconnect-2/      # Sessões WhatsApp (instância 2)
│   └── wppconnect-3/      # Sessões WhatsApp (instância 3)
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

1. Verifique se WPPConnect está rodando:
   ```bash
   docker-compose ps | grep wppconnect
   ```

2. Verifique os logs de cada instância:
   ```bash
   docker-compose logs wppconnect-1
   docker-compose logs wppconnect-2
   ```

3. Verifique a saúde do serviço:
   ```bash
   curl http://localhost:21465/api/health
   ```

4. Confirme webhook configurado no .env:
   ```bash
   grep WEBHOOK_URL .env
   ```

5. Reinicie o serviço se necessário:
   ```bash
   docker-compose restart wppconnect-1
   ```

### QR Code não aparece

1. Verifique se a sessão foi iniciada corretamente:
   ```bash
   docker-compose logs wppconnect-1 | grep -i session
   ```

2. Limpe sessões antigas se necessário:
   ```bash
   # Para instância 1
   rm -rf volumes/wppconnect-1/tokens/*
   rm -rf volumes/wppconnect-1/userDataDir/*
   docker-compose restart wppconnect-1
   ```

### Load Balancer não distribui tráfego

1. Verifique se as instâncias secundárias estão ativas:
   ```bash
   docker-compose ps | grep wppconnect
   ```

2. Verifique logs do load balancer:
   ```bash
   docker-compose logs wppconnect-lb
   ```

3. Teste a conectividade:
   ```bash
   curl http://localhost:21400/health
   curl http://localhost:21400/lb-status
   ```

### Failover não funciona

1. Simule falha em uma instância:
   ```bash
   docker-compose stop wppconnect-1
   ```

2. Verifique se o load balancer redirecionou:
   ```bash
   curl http://localhost:21400/lb-status
   docker-compose logs wppconnect-lb | tail -20
   ```

3. Restaure a instância:
   ```bash
   docker-compose start wppconnect-1
   ```

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

## Configuração do WPPConnect

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `WPPCONNECT_SECRET_KEY` | Chave secreta para autenticação | Obrigatório |
| `WPPCONNECT_PORT_1` | Porta da instância 1 | 21465 |
| `WPPCONNECT_PORT_2` | Porta da instância 2 | 21466 |
| `WPPCONNECT_PORT_3` | Porta da instância 3 | 21467 |
| `WPPCONNECT_LB_PORT` | Porta do Load Balancer | 21400 |
| `WEBHOOK_URL` | URL para receber eventos | Obrigatório |

### Endpoints Principais

| Endpoint | Descrição |
|----------|-----------|
| `POST /api/{session}/generate-token` | Gerar token de acesso |
| `POST /api/{session}/start-session` | Iniciar sessão e obter QR |
| `GET /api/{session}/check-connection-session` | Verificar status |
| `POST /api/{session}/send-message` | Enviar mensagem |
| `POST /api/{session}/close-session` | Encerrar sessão |

### Resolução de LID (Número oculto)

O WPPConnect possui endpoint dedicado para resolver números LID:
```bash
GET /api/{session}/contact/pn-lid/{pnLid}
```

Isso retorna o número real do contato, resolvendo o problema de privacidade do WhatsApp.

---

## Capacidade Estimada

| Modo | Conexões WhatsApp | Mensagens/dia |
|------|-------------------|---------------|
| Padrão (1 instância) | 5-10 | ~10.000 |
| Multi-Instance (2 instâncias) | 10-20 | ~25.000 |
| High-Availability (3 instâncias) | 20-30 | ~50.000 |

*Valores aproximados, dependem do hardware e uso.*

---

## Suporte

Para dúvidas e suporte, entre em contato com o desenvolvedor.

**Versão da documentação:** 2.1.0  
**API WhatsApp:** WPPConnect Server (Multi-Instance)
