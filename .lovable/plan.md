
# Plano: Instalacao Unificada - Sistema Completo na Mesma VPS

## Resumo Executivo

Vou modificar a infraestrutura para rodar TUDO na mesma VPS onde o Baileys ja esta funcionando (`chatbotvital.store`), unificando:

- Frontend (interface do usuario)
- Backend Supabase (banco de dados, autenticacao, storage, edge functions)
- Baileys WhatsApp Server (ja instalado)

---

## Arquitetura Final

```text
SUA VPS: chatbotvital.store
+------------------------------------------------------------------+
|                                                                  |
|  NGINX (porta 80/443)                                           |
|  +------------------------------------------------------------+ |
|  |  / → Frontend React                                        | |
|  |  /rest/v1/ → PostgREST (API)                              | |
|  |  /auth/v1/ → GoTrue (Autenticacao)                        | |
|  |  /storage/v1/ → Storage API                               | |
|  |  /functions/v1/ → Edge Functions                          | |
|  |  /baileys/ → Baileys Server (interno)                     | |
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
|  |  Baileys Server    | (ja instalado, vamos integrar)         |
|  +--------------------+                                         |
|                                                                  |
+------------------------------------------------------------------+
```

---

## O Que Sera Feito

### 1. Modificar docker-compose.yml Principal

Vou adicionar o servico `baileys` diretamente no `deploy/docker-compose.yml`, usando um profile `baileys` para facilitar o gerenciamento.

Alteracoes:
- Adicionar servico `baileys` no docker-compose.yml principal
- Configurar para usar a rede `supabase-network`
- Atualizar variaveis de ambiente para apontar para o Baileys interno

### 2. Atualizar Configuracao do Nginx

Modificar `deploy/nginx/nginx.conf` para incluir proxy para o Baileys interno:

```text
location /baileys/ {
    proxy_pass http://baileys:3000/;
    ...
}
```

### 3. Criar Script de Instalacao Unificada

Criar `deploy/scripts/install-unified.sh` que:
1. Detecta se Baileys ja esta instalado
2. Migra sessoes existentes do Baileys standalone
3. Instala todo o sistema unificado
4. Configura automaticamente as credenciais

### 4. Atualizar .env.example

Adicionar variaveis do Baileys no arquivo de exemplo:
- `BAILEYS_API_KEY` 
- `BAILEYS_WEBHOOK_URL`
- `WHATSAPP_ENGINE=baileys`

### 5. Atualizar Edge Functions

Modificar as edge functions para usar URL interna:
- De: `https://chatbotvital.store` (externo)
- Para: `http://baileys:3000` (interno, via Docker network)

---

## Arquivos a Serem Modificados

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `deploy/docker-compose.yml` | Modificar | Adicionar servico `baileys` com profile |
| `deploy/nginx/nginx.conf` | Modificar | Adicionar proxy `/baileys/` |
| `deploy/.env.example` | Modificar | Adicionar variaveis Baileys |
| `deploy/scripts/install-unified.sh` | Criar | Script de instalacao unificada |
| `deploy/docs/INSTALACAO.md` | Modificar | Documentar instalacao com Baileys |

---

## Processo de Migracao

### Passo 1: Backup do Baileys Atual

```bash
cd /opt/baileys
tar -czf /tmp/baileys-backup.tar.gz sessions/
```

### Passo 2: Parar Baileys Standalone

```bash
cd /opt/baileys
docker compose down
```

### Passo 3: Instalar Sistema Unificado

```bash
cd /opt/sistema
./scripts/install-unified.sh
```

O script automaticamente:
- Detecta que Baileys ja foi instalado
- Copia sessoes existentes
- Usa a mesma API Key
- Inicia tudo junto

### Passo 4: Verificar

```bash
# Ver todos os containers
docker compose ps

# Testar acesso
curl https://chatbotvital.store/health        # Frontend
curl https://chatbotvital.store/baileys/health # Baileys
```

---

## Vantagens da Unificacao

| Aspecto | Antes (Separado) | Depois (Unificado) |
|---------|------------------|-------------------|
| Containers | Baileys isolado | Tudo na mesma rede Docker |
| SSL | Certificado por servico | Certificado unico |
| Comunicacao | Via Internet (HTTPS) | Via rede interna (mais rapido) |
| Gerenciamento | 2 docker-compose | 1 docker-compose |
| Backup | Separados | Unificado |
| Atualizacao | Manual cada um | Script unico |

---

## Compatibilidade

O sistema continuara funcionando normalmente com:
- Todas as suas sessoes WhatsApp existentes
- A mesma API Key que voce ja tem
- O mesmo dominio `chatbotvital.store`

---

## Secao Tecnica

### Docker Compose: Novo Servico Baileys

```yaml
# Profile: baileys
baileys:
  build: ./baileys
  container_name: baileys-server
  restart: unless-stopped
  profiles:
    - baileys
  environment:
    - API_KEY=${BAILEYS_API_KEY}
    - WEBHOOK_URL=http://kong:8000/functions/v1/baileys-webhook
    - NODE_ENV=production
    - LOG_LEVEL=${LOG_LEVEL:-info}
  volumes:
    - ./volumes/baileys/sessions:/app/sessions
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 30s
  networks:
    - supabase-network
```

### Nginx: Proxy para Baileys

```nginx
# Baileys API (interno)
location /baileys/ {
    proxy_pass http://baileys:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}
```

### Variaveis de Ambiente

```env
# Engine WhatsApp
WHATSAPP_ENGINE=baileys

# Baileys Config (integrado)
BAILEYS_API_KEY=9759d46309e1eeae92d423f1ee860177671095af60ead9d23422fb4c8fb8b435
BAILEYS_INTERNAL_URL=http://baileys:3000
BAILEYS_EXTERNAL_URL=https://chatbotvital.store/baileys

# Webhook (interno via Kong)
WEBHOOK_URL=http://kong:8000/functions/v1/baileys-webhook
```

### Script de Instalacao Unificada

O novo script `install-unified.sh` vai:

1. **Detectar instalacao Baileys existente:**
   ```bash
   if [ -d "/opt/baileys/sessions" ]; then
       BAILEYS_EXISTS=true
       EXISTING_API_KEY=$(grep API_KEY /opt/baileys/.env | cut -d= -f2)
   fi
   ```

2. **Migrar dados:**
   ```bash
   mkdir -p volumes/baileys
   cp -r /opt/baileys/sessions volumes/baileys/
   ```

3. **Usar mesmas credenciais:**
   ```bash
   BAILEYS_API_KEY=${EXISTING_API_KEY:-$(openssl rand -hex 32)}
   ```

4. **Iniciar com profile correto:**
   ```bash
   docker compose --profile baileys up -d
   ```

---

## Resultado Final

Apos aprovar e implementar este plano:

1. **Tudo rodando em um unico docker-compose**
2. **Acesso unificado via `https://chatbotvital.store`**
3. **Sessoes WhatsApp preservadas**
4. **Comunicacao interna mais rapida**
5. **Backup e atualizacao simplificados**
6. **Gerenciamento centralizado**

Voce tera controle total sobre seu sistema, 100% self-hosted na sua VPS!
