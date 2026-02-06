

## Correção Definitiva do Erro de Login ("Failed to fetch")

### Por que o login continua falhando

Depois de analisar todo o código detalhadamente, identifiquei **dois problemas** que, combinados, causam o erro "Failed to fetch" no navegador:

---

### Problema 1: Headers CORS perdidos no Nginx (causa principal do "Failed to fetch")

Quando voce clica em "Entrar", o navegador faz duas requisicoes:

1. **OPTIONS** (preflight) - "Posso fazer essa requisicao?"
2. **POST** (login real) - envia email/senha

O problema esta no Nginx. Olhe este trecho da configuracao atual:

```text
location /auth/v1/ {
    add_header Access-Control-Allow-Origin * always;     <-- definido AQUI
    add_header Access-Control-Allow-Methods "..." always;
    add_header Access-Control-Allow-Headers "..." always;

    if ($request_method = OPTIONS) {
        return 204;    <-- mas NAO herda os headers acima!
    }
}
```

No Nginx, o bloco `if` cria um contexto novo que **nao herda** os `add_header` do bloco pai. O resultado:

- OPTIONS retorna 204 **sem nenhum header CORS**
- O navegador bloqueia a requisicao POST
- Voce ve "Failed to fetch"

Isso acontece em **todos** os 4 locations de API (auth, rest, storage, functions) nos **dois** server blocks (HTTP e HTTPS).

### Problema 2: Diagnostico insuficiente no repair-auth.sh

O script de reparo sincroniza senhas e reinicia o Auth, mas nao testa a cadeia completa:

```text
Browser -> Nginx -> Kong -> Auth -> DB
```

Ele testa apenas `DB <-> Auth` mas nao testa se o Nginx esta servindo as respostas corretamente para o navegador.

---

### O que sera alterado

#### 1. Nginx: Corrigir CORS em todos os locations

Para cada location de API (`/auth/v1/`, `/rest/v1/`, `/storage/v1/`, `/functions/v1/`), tanto no server HTTP quanto HTTPS:

**Antes (quebrado):**
```text
add_header Access-Control-Allow-Origin * always;
add_header Access-Control-Allow-Methods "..." always;
add_header Access-Control-Allow-Headers "..." always;

if ($request_method = OPTIONS) {
    return 204;
}
```

**Depois (corrigido):**
```text
if ($request_method = OPTIONS) {
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, apikey, X-Client-Info, x-upsert" always;
    add_header Access-Control-Max-Age 3600;
    add_header Content-Length 0;
    return 204;
}

add_header Access-Control-Allow-Origin * always;
add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;
add_header Access-Control-Allow-Headers "Authorization, Content-Type, apikey, X-Client-Info, x-upsert" always;
```

Os headers ficam **duplicados de proposito**: uma vez dentro do `if` (para OPTIONS) e outra fora (para GET/POST/etc).

#### 2. repair-auth.sh: Diagnostico completo da cadeia

Adicionar teste end-to-end apos o reparo:

```text
Teste 1: DB esta healthy?
Teste 2: Senha do supabase_auth_admin funciona? (psql direto)
Teste 3: Auth esta healthy? (wget no container)
Teste 4: Kong responde? (curl localhost:8000/auth/v1/health)
Teste 5: Nginx responde? (curl localhost/auth/v1/health)
Teste 6: OPTIONS tem CORS? (curl -X OPTIONS com headers)
Teste 7: Login funciona? (curl POST com email/senha)
```

Se qualquer teste falhar, o script mostra exatamente onde esta o problema.

#### 3. install-unified.sh: Forcar rebuild do frontend

Remover `frontend/dist` antes de compilar para garantir que o `config.js` e a tag `<script>` sejam sempre injetados.

---

### Arquivos que serao alterados

1. **`deploy/nginx/nginx.conf`** - Corrigir CORS em 8 locations (4 por server block)
2. **`deploy/scripts/repair-auth.sh`** - Adicionar diagnostico completo da cadeia
3. **`deploy/scripts/install-unified.sh`** - Forcar rebuild do frontend

### Como executar apos a aprovacao

```bash
cd /opt/sistema && git pull origin main
cd deploy
sudo bash scripts/repair-auth.sh
```

O repair-auth.sh vai:
1. Sincronizar senhas das roles
2. Reiniciar Auth + Nginx
3. Testar toda a cadeia e mostrar exatamente onde falha (se falhar)

### Credenciais

- Email: `admin@admin.com`
- Senha: `123456`

