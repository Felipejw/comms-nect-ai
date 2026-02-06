

# Corrigir SUPABASE_ANON_KEY ausente no Baileys

## Problema

O script `install-simple.sh` gera o arquivo `.env` com apenas 3 variaveis (API_KEY, WEBHOOK_URL, LOG_LEVEL), mas o `docker-compose.yml` espera tambem a variavel `SUPABASE_ANON_KEY`. Sem ela:

- O Docker emite o warning: `The "SUPABASE_ANON_KEY" variable is not set. Defaulting to a blank string.`
- O servidor Baileys nao consegue autenticar as chamadas de webhook para o backend (edge function `baileys-webhook`)
- Mensagens recebidas no WhatsApp nao chegam ao sistema

## Correcao

### Arquivo: `deploy/baileys/scripts/install-simple.sh`

Adicionar a variavel `SUPABASE_ANON_KEY` na geracao do arquivo `.env` (em torno da linha 95-109). O valor e a chave publica (anon key) do projeto, que ja e conhecida e segura para uso no frontend.

O bloco `.env` passara a incluir:

```text
# Supabase Anon Key para autenticacao do webhook
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdWNhbndicGxlb2NleW5tZW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNTUxODIsImV4cCI6MjA4MjYzMTE4Mn0.1EQ_XXifnOx3REsjE9ZCbd7dYC7IvXxEjZFIP25vmOA
```

### Resultado

Apos esta correcao, ao rodar o bootstrap novamente no VPS:

1. O `.env` sera gerado com todas as 4 variaveis necessarias
2. O Docker nao emitira mais o warning sobre SUPABASE_ANON_KEY
3. O Baileys conseguira autenticar as chamadas de webhook
4. Mensagens recebidas no WhatsApp chegarao ao sistema corretamente

### Acao imediata no VPS

Enquanto a correcao e publicada, o usuario pode adicionar a variavel manualmente:

```text
sudo nano /opt/baileys/.env
```

Adicionar a linha:
```text
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdWNhbndicGxlb2NleW5tZW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNTUxODIsImV4cCI6MjA4MjYzMTE4Mn0.1EQ_XXifnOx3REsjE9ZCbd7dYC7IvXxEjZFIP25vmOA
```

Depois reiniciar:
```text
cd /opt/baileys && sudo docker compose restart
```

## Detalhes tecnicos

### Arquivos modificados
- `deploy/baileys/scripts/install-simple.sh` - adicionar SUPABASE_ANON_KEY ao bloco de geracao do .env

### Por que e seguro
A anon key e uma chave publica, projetada para ser usada no frontend. Ela so permite operacoes autorizadas pelas politicas de seguranca (RLS) do banco de dados. Nao e uma chave secreta.
