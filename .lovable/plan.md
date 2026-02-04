
# Plano: Simplificacao Completa da Instalacao Baileys

## ✅ IMPLEMENTAÇÃO CONCLUÍDA

### Arquivos Modificados/Criados

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `deploy/baileys/docker-compose.yml` | ✅ Simplificado | Removido serviço nginx, apenas porta 3000 |
| `deploy/baileys/scripts/install-simple.sh` | ✅ Criado | Script zero-config automático |
| `deploy/baileys/scripts/bootstrap.sh` | ✅ Atualizado | Usa install-simple.sh |
| `deploy/baileys/scripts/diagnostico.sh` | ✅ Atualizado | Nova arquitetura |
| `deploy/baileys/nginx-snippet.conf` | ✅ Criado | Snippet para Nginx do host |

### O que mudou

1. **Docker Compose**: Agora só tem o container `baileys` expondo a porta 3000 (sem container nginx)

2. **Instalação Zero-Config**: O script `install-simple.sh` gera tudo automaticamente:
   - API Key via `openssl rand -hex 32`
   - WEBHOOK_URL hardcoded para `https://qducanwbpleoceynmend.supabase.co/functions/v1/baileys-webhook`
   - Cria arquivo `.env`, `CREDENCIAIS.txt` e `nginx-snippet.conf`

3. **Proxy Manual**: O usuário precisa adicionar o snippet no Nginx do host (mostrado ao final da instalação)

### Como Reinstalar no VPS

```bash
# Comando único para reinstalar
curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/baileys/scripts/bootstrap.sh | sudo bash
```

Após a instalação, adicione o bloco ao Nginx do host:

```nginx
location /baileys/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}
```

Depois: `sudo nginx -t && sudo systemctl reload nginx`
