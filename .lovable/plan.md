

# Corrigir Instalacao Self-Hosted - 3 Problemas Encontrados

A instalacao travou porque o Kong (gateway de API) nao esta rodando na porta 8000 (HTTP 000 = conexao recusada). Identifiquei 3 causas raiz que precisam ser corrigidas juntas.

---

## Problema 1: Chaves JWT Invalidas

O script gera as chaves ANON_KEY e SERVICE_ROLE_KEY usando `node -e "require('jsonwebtoken')..."`. Numa VPS limpa, o Node.js nao esta instalado e o pacote `jsonwebtoken` nao existe. O fallback gera uma string aleatoria com `openssl rand` -- que NAO e um JWT valido.

O GoTrue (autenticacao) exige JWTs validos assinados com o JWT_SECRET. Com chaves invalidas, o GoTrue nao inicializa, e o Kong depende dele.

**Correcao:** Gerar JWTs validos usando Python (disponivel em toda VPS Ubuntu) ou usando um container Docker com Node.js.

---

## Problema 2: Edge Functions sem `main` Router

O docker-compose define o servico `functions` com o comando:

```text
command: start --main-service /home/deno/functions/main
```

Mas o diretorio `supabase/functions/main/` nao existe no projeto. O container de Edge Functions crasha ao iniciar, e o Kong depende deste servico.

**Correcao:** Criar `supabase/functions/main/index.ts` - um roteador que encaminha requisicoes para as funcoes individuais.

---

## Problema 3: Health Check Verifica Porta Errada

O `wait_for_auth()` verifica `http://localhost:8000/auth/v1/health` (Kong), mas deveria verificar o GoTrue diretamente em `http://localhost:9999/health`. Se o Kong nao subiu por outro motivo, o script nao consegue distinguir qual servico falhou.

**Correcao:** Verificar GoTrue diretamente na porta 9999 E Kong separadamente na porta 8000, com diagnosticos detalhados em caso de falha.

---

## Plano de Implementacao

### Arquivo 1: `deploy/scripts/install-unified.sh`

**Funcao `generate_jwt_keys()`** - Reescrever para gerar JWTs validos sem depender de Node.js:
- Usar Python3 (pre-instalado no Ubuntu) com `hmac` e `base64` para criar JWTs
- Fallback: usar um container Docker temporario com Node.js se Python nao estiver disponivel
- Validar que as chaves geradas sao JWTs validos (contem 2 pontos separadores)

**Funcao `wait_for_auth()`** - Melhorar diagnostico:
- Verificar GoTrue diretamente em `http://localhost:9999/health` (nao via Kong)
- Adicionar funcao separada `wait_for_kong()` que verifica porta 8000
- Em caso de falha, executar `docker logs supabase-auth --tail 20` para mostrar a causa real
- Adicionar `docker ps -a` para verificar quais containers estao rodando

**Funcao `start_services()`** - Mais resiliente:
- Trocar `sleep 30` fixo por verificacao ativa de containers
- Verificar status de cada container apos iniciar

### Arquivo 2: `supabase/functions/main/index.ts`

Criar o roteador principal das Edge Functions para self-hosted:
- Recebe todas as requisicoes em `/functions/v1/<nome-funcao>`
- Importa e encaminha para a funcao correspondente
- Retorna 404 para funcoes desconhecidas

### Arquivo 3: `deploy/supabase/init.sql`

Pequenos ajustes de resiliencia:
- Remover `pg_stat_statements` (pode nao existir no container, e nao e necessario)
- Manter `pgcrypto` e `uuid-ossp` que sao essenciais

### Arquivo 4: `deploy/docker-compose.yml`

Ajustar dependencias do Kong:
- Remover `functions` da lista de `depends_on` do Kong (funcoes nao devem bloquear o gateway)
- Adicionar `condition: service_healthy` para auth, para Kong so iniciar quando auth estiver pronto

---

## Detalhes Tecnicos

### Geracao de JWT com Python3

```text
python3 -c "
import hmac, hashlib, base64, json, time
header = base64url(json.dumps({'alg':'HS256','typ':'JWT'}))
payload = base64url(json.dumps({'role':'anon','iss':'supabase','iat':now,'exp':now+10years}))
signature = hmac.new(secret, header.payload, sha256)
print(header.payload.signature)
"
```

### Estrutura do Main Router

```text
supabase/functions/main/index.ts
  - Importa Deno.serve
  - Extrai nome da funcao do path
  - Faz proxy interno para a funcao correta
  - Trata CORS e erros
```

### Fluxo de Inicializacao Corrigido

```text
1. Docker Compose up
2. Banco de dados fica healthy
3. GoTrue (auth) conecta ao banco e inicializa (porta 9999)
4. PostgREST, Storage, Realtime inicializam
5. Edge Functions inicializam com main router
6. Kong inicializa (porta 8000) apos auth estar healthy
7. Script detecta GoTrue em 9999, depois Kong em 8000
8. Cria admin e tenant com sucesso
```

---

## Resumo das Alteracoes

| Arquivo | Acao |
|---------|------|
| `deploy/scripts/install-unified.sh` | Corrigir JWT, health checks, diagnosticos |
| `supabase/functions/main/index.ts` | Criar (novo) - roteador de funcoes |
| `deploy/supabase/init.sql` | Remover pg_stat_statements |
| `deploy/docker-compose.yml` | Ajustar depends_on do Kong |

Nenhuma alteracao no frontend ou no backend Cloud. Apenas arquivos de deploy.

