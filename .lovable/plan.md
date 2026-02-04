
# Plano: Conectar Baileys ao Nginx Unificado

## Diagnóstico

O setup atual:
- **app-nginx**: Container Nginx nas portas 80/443, na rede `supabase-network`
- **baileys-server**: Container Baileys na porta 3000, em rede separada (bridge padrão)

O arquivo `deploy/nginx/nginx.conf` já tem a configuração para `/baileys/`:
```nginx
location /baileys/ {
    set $upstream_baileys baileys:3000;  # <- Espera container "baileys" na mesma rede
    ...
}
```

Mas o container se chama `baileys-server` e está em outra rede Docker.

## Solução

### Passo 1: Conectar o container à rede correta

Execute no VPS:
```bash
sudo docker network connect deploy_supabase-network baileys-server
```

### Passo 2: Atualizar a configuração do Nginx

O arquivo `deploy/nginx/nginx.conf` precisa ser atualizado para usar o nome correto do container (`baileys-server` em vez de `baileys`).

**Modificação em** `deploy/nginx/nginx.conf`:

Na linha que define o upstream do Baileys, alterar:
```nginx
# De:
set $upstream_baileys baileys:3000;

# Para:
set $upstream_baileys baileys-server:3000;
```

### Passo 3: Aplicar a configuração

Após a modificação do arquivo e publicação, no VPS executar:
```bash
# Ir para o diretório do deploy unificado
cd /caminho/do/deploy  # (onde está o docker-compose.yml principal)

# Recarregar a configuração do Nginx
sudo docker exec app-nginx nginx -s reload
```

## Alternativa Rápida (Sem editar arquivos)

Se preferir uma correção imediata sem aguardar publicação, você pode:

1. Conectar à rede:
```bash
sudo docker network connect deploy_supabase-network baileys-server
```

2. Criar um alias de rede para o container:
```bash
sudo docker network disconnect deploy_supabase-network baileys-server
sudo docker network connect --alias baileys deploy_supabase-network baileys-server
```

Isso faz o container `baileys-server` responder pelo nome `baileys` dentro da rede, sem precisar modificar o nginx.conf.

3. Testar:
```bash
curl https://chatbotvital.store/baileys/health
```

## Resultado Esperado

Após a correção, o fluxo será:
```
Frontend -> Edge Function -> https://chatbotvital.store/baileys/...
                                      |
                              app-nginx (443)
                                      |
                              baileys-server:3000 (via rede Docker)
                                      |
                              Retorna JSON com QR Code
```

## Seção Técnica

### Por que o erro ocorria

1. O Nginx dentro do container tentava resolver `baileys:3000`
2. Como `baileys-server` estava em outra rede Docker, o DNS não encontrava
3. O Nginx retornava 502 Bad Gateway
4. A Edge Function recebia HTML de erro em vez de JSON

### Verificação da rede atual

Para confirmar o nome da rede, execute:
```bash
sudo docker network ls | grep -E "supabase|deploy"
```

A rede provavelmente se chama `deploy_supabase-network` (prefixo do diretório + nome definido no compose).

### Arquivos a modificar

| Arquivo | Alteração |
|---------|-----------|
| `deploy/nginx/nginx.conf` | Linha 159: mudar `baileys:3000` para `baileys-server:3000` |
