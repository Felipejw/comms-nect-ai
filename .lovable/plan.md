
# Plano: Corrigir Roteamento do Nginx para Baileys

## Problema Identificado

O Nginx está alterando o path incorretamente. Quando a requisição vai para `/baileys/health`, o backend recebe `/` ao invés de `/health`, causando o erro "Unauthorized" (pois só `/health` é permitido sem API Key).

## Solução

### 1. Corrigir Configuração do Nginx

**Arquivo:** `deploy/nginx/nginx.conf`

Modificar o bloco `/baileys/` (linhas ~212-225) para garantir que o path seja preservado corretamente:

```nginx
# Baileys API Proxy - resolução dinâmica
location /baileys/ {
    set $upstream_baileys baileys:3000;
    
    # Reescrever o path removendo /baileys
    rewrite ^/baileys/(.*)$ /$1 break;
    
    proxy_pass http://$upstream_baileys;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    
    # WebSocket support for Baileys
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
}
```

**Alterações principais:**
- Remover a barra final do `proxy_pass` 
- Adicionar `rewrite` explícito para garantir remoção correta do prefixo `/baileys`

### 2. Comandos para Aplicar no VPS

Após eu fazer a alteração no código, você precisará executar:

```bash
# Navegar para o diretório
cd /opt/sistema/deploy

# Atualizar o código (se estiver usando git)
git pull

# OU copiar o arquivo nginx.conf atualizado manualmente

# Reiniciar o Nginx para aplicar as mudanças
sudo docker compose restart nginx

# Testar novamente
curl -k https://chatbotvital.store/baileys/health
```

### 3. Resultado Esperado

Após a correção, o curl deve retornar:
```json
{
  "status": "ok",
  "timestamp": "2026-02-04T...",
  "sessions": 0
}
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `deploy/nginx/nginx.conf` | Corrigir bloco location /baileys/ com rewrite explícito |

## Próximos Passos

1. Aprovar este plano para eu fazer a alteração
2. Atualizar o arquivo no VPS
3. Reiniciar o Nginx
4. Testar a conexão novamente pelo sistema
