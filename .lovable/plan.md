

## Correcao: Nginx proxy_pass com variaveis destrói o caminho da URI

### Causa raiz confirmada pelo diagnostico

O diagnostico mostra o padrao classico de erro de proxy_pass com variaveis no Nginx:

```text
Teste 4 - Kong direto (porta 8000):  OK     (sem Nginx no meio)
Teste 5 - Via Nginx (porta 80):      404    (Nginx "come" o resto do caminho)
Teste 6 - OPTIONS preflight:         OK     (Nginx retorna 204, nao chega no Kong)
Teste 7 - Login POST:                404    (Nginx envia caminho errado ao Kong)
```

### O que acontece tecnicamente

Quando o Nginx usa uma **variavel** no `proxy_pass`, o comportamento muda:

**SEM variavel (funcionaria correto):**
```text
location /auth/v1/ {
    proxy_pass http://kong:8000/auth/v1/;
}

Requisicao: /auth/v1/health
Nginx remove prefixo /auth/v1/ -> sobra "health"
Adiciona ao proxy_pass /auth/v1/ -> /auth/v1/health
Envia para: http://kong:8000/auth/v1/health  (CORRETO)
```

**COM variavel (o que temos hoje - QUEBRADO):**
```text
location /auth/v1/ {
    set $upstream_auth kong:8000;
    proxy_pass http://$upstream_auth/auth/v1/;
}

Requisicao: /auth/v1/health
Nginx NAO faz a substituicao de prefixo
A URI "/auth/v1/" do proxy_pass substitui TODA a URI original
Envia para: http://kong:8000/auth/v1/  (SEM o "health" -> 404!)
```

### A correcao

Remover o caminho do `proxy_pass` e deixar apenas o host. Quando o `proxy_pass` nao tem URI (sem caminho apos a porta), o Nginx passa a URI original completa:

**Antes (quebrado):**
```text
set $upstream_auth kong:8000;
proxy_pass http://$upstream_auth/auth/v1/;
```

**Depois (correto):**
```text
set $upstream_auth kong:8000;
proxy_pass http://$upstream_auth;
```

Isso faz com que `/auth/v1/health` seja enviado como `/auth/v1/health` para o Kong - exatamente como deve ser.

### Arquivos que serao alterados

**1. `deploy/nginx/nginx.conf`** - Corrigir 10 proxy_pass (5 por server block):

| Location | Antes | Depois |
|----------|-------|--------|
| `/rest/v1/` | `proxy_pass http://$upstream_rest/rest/v1/;` | `proxy_pass http://$upstream_rest;` |
| `/auth/v1/` | `proxy_pass http://$upstream_auth/auth/v1/;` | `proxy_pass http://$upstream_auth;` |
| `/storage/v1/` | `proxy_pass http://$upstream_storage/storage/v1/;` | `proxy_pass http://$upstream_storage;` |
| `/functions/v1/` | `proxy_pass http://$upstream_functions/functions/v1/;` | `proxy_pass http://$upstream_functions;` |
| `/realtime/v1/` | `proxy_pass http://$upstream_realtime/realtime/v1/;` | `proxy_pass http://$upstream_realtime;` |

Mesma correcao repetida no server block HTTPS.

**2. `deploy/scripts/repair-auth.sh`** - Adicionar reinicio do Nginx apos correcoes e log extra caso o teste 5 falhe mostrando a resposta do corpo.

### Por que funciona

- A location `/auth/v1/` ja filtra apenas requests que comecam com `/auth/v1/`
- O Kong ja espera receber `/auth/v1/health`, `/auth/v1/token`, etc.
- Entao basta passar a URI original completa sem modificacao

### Por que as correcoes anteriores nao resolveram

Todas as correcoes anteriores focaram em:
- Senhas das roles do banco (ja estao corretas - testes 1-3 passam)
- Headers CORS (ja estao corretos - teste 6 passa)
- Formato do roles.sql (ja esta correto - Auth esta healthy)

O problema real sempre foi o `proxy_pass` com variavel + caminho, que e um comportamento nao-obvio e pouco documentado do Nginx.

### Como executar apos aprovacao

```bash
cd /opt/sistema && git pull origin main
cd deploy
docker compose restart nginx
```

Nao precisa do repair-auth.sh completo - basta reiniciar o Nginx para carregar a nova configuracao.

Se quiser validar manualmente antes de reiniciar:
```bash
docker exec app-nginx nginx -t
```

### Credenciais

- Email: `admin@admin.com`
- Senha: `123456`

