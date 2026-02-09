

## Diagnostico Final

Os logs revelam que o problema NAO e a API Key (esta correta). Sao dois problemas distintos:

### Problema 1: Fallback HTTP falha
- HTTPS falha por certificado SSL invalido (`CaUsedAsEndEntity`)
- O sistema tenta HTTP como fallback: `http://chatbotvital.store/baileys/sessions/Gatte/qr`
- O Nginx na porta 80 NAO tem o bloco `/baileys/` configurado (so redireciona para HTTPS ou retorna 404)
- Resultado: 404 HTML

### Problema 2: URL do endpoint de status incorreta
- A Edge Function chama `/sessions/{name}/status` - este endpoint NAO existe no servidor Baileys
- O endpoint correto e `GET /sessions/{name}` (sem `/status`)

### Problema 3: check-connections usa prefixo `/api/session/` errado
- Deveria usar `/sessions/` para ser consistente com o servidor Baileys

---

## Plano de Correcao

### 1. Melhorar o `resilientFetch` na Edge Function `baileys-instance`

Quando o SSL falhar e o fallback HTTP tambem falhar com 404/HTML, tentar uma terceira via: conectar diretamente ao container Docker pela rede interna (`http://baileys-server:3000`), removendo o prefixo `/baileys` da URL.

A logica sera:
- Tentar HTTPS (URL original)
- Se SSL falhar, tentar HTTP (mesma URL com http://)
- Se HTTP retornar 404 ou HTML, tentar URL interna Docker (`http://baileys-server:3000/path` sem o prefixo `/baileys`)

### 2. Corrigir endpoint de status

No `baileys-instance/index.ts`, na acao `status` (linha 237):
- De: `/sessions/${sessionName}/status`
- Para: `/sessions/${sessionName}`

### 3. Corrigir prefixo no `check-connections`

No `check-connections/index.ts`:
- De: `/api/session/${sessionName}/status` e `/api/session/${sessionName}/disconnect`
- Para: `/sessions/${sessionName}` e DELETE `/sessions/${sessionName}`
- Adicionar `resilientFetch` com fallback interno

### 4. Adicionar config opcional `baileys_internal_url`

Para ambientes Docker, permitir configurar uma URL interna (ex: `http://baileys-server:3000`) como fallback automatico.

---

## Detalhes Tecnicos

### Arquivos a modificar:

1. **`supabase/functions/baileys-instance/index.ts`**
   - Atualizar `resilientFetch` para tentar URL interna Docker como terceiro fallback
   - Corrigir URL do endpoint status: remover sufixo `/status`

2. **`supabase/functions/check-connections/index.ts`**
   - Corrigir prefixo `/api/session/` para `/sessions/`
   - Adicionar fallback HTTP/interno similar ao `baileys-instance`

3. **`supabase/functions/baileys-create-session/index.ts`**
   - Verificar e corrigir URLs se necessario
   - Adicionar mesmo padrao de fallback

### Logica do novo `resilientFetch`:

```text
resilientFetch(url)
  |
  +-- Tentar HTTPS original
  |     |
  |     +-- Sucesso? Retornar resposta
  |     |
  |     +-- SSL Error?
  |           |
  |           +-- Tentar HTTP (https->http)
  |           |     |
  |           |     +-- Sucesso (status != 404)? Retornar
  |           |     |
  |           |     +-- 404 ou HTML?
  |           |           |
  |           |           +-- Extrair path, tentar http://baileys-server:3000/path
  |           |                 (removendo prefixo /baileys)
  |           |
  |           +-- Erro de conexao?
  |                 +-- Tentar URL interna Docker
```

### Acao imediata do usuario (VPS)

Enquanto o codigo e atualizado, voce pode corrigir o problema imediatamente adicionando o bloco `/baileys/` no servidor HTTP (porta 80) do Nginx:

```bash
# Editar config do Nginx no VPS
sudo nano /etc/nginx/sites-available/default
```

Dentro do bloco `server` que escuta na porta 80, adicionar ANTES do `return 301`:

```
location /baileys/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}
```

Depois recarregar: `sudo nginx -t && sudo systemctl reload nginx`

