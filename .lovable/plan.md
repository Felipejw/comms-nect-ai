

# Restaurar Baileys - Edge Function nao deployada

## Diagnostico

Ao testar a edge function `baileys-instance` diretamente, ela retorna:

```text
404 NOT_FOUND - Requested function was not found
```

Isso significa que a funcao existe no codigo (`supabase/functions/baileys-instance/index.ts`) e na configuracao (`supabase/config.toml`), mas nao esta deployada no servidor Lovable Cloud. Por isso o frontend mostra "Failed to fetch" ao tentar verificar a saude do servidor Baileys.

## Correcao

### Passo 1: Redeployar as edge functions

A correcao e simples: forcar o redeploy das edge functions criticas do Baileys:
- `baileys-instance` (a principal, que gerencia sessoes e health check)
- `baileys-webhook` (recebe eventos do servidor Baileys)
- `baileys-create-session` (cria sessoes em background)
- `send-whatsapp` (envia mensagens)

Nenhuma alteracao de codigo e necessaria. Apenas o deploy precisa ser disparado.

### Passo 2: Verificar o VPS

Apos o deploy das edge functions, o usuario deve:

1. Verificar se o bootstrap do VPS completou com sucesso re-executando:
```text
curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/baileys/scripts/bootstrap.sh | sudo bash
```

2. Confirmar que o container esta rodando:
```text
cd /opt/baileys && docker compose ps
```

3. Testar a saude localmente:
```text
curl http://localhost:3000/health
```

### Resultado esperado

Apos o redeploy, o botao "Testar Conexao" na pagina de Configuracoes vai conseguir chamar a edge function, que por sua vez vai se conectar ao servidor Baileys no VPS e retornar o status correto.

## Detalhes tecnicos

- A edge function `baileys-instance` nao requer nenhuma alteracao de codigo
- O arquivo `supabase/config.toml` ja contem a configuracao correta (linha 57-58)
- O diretorio `supabase/functions/baileys-instance/` existe com o `index.ts`
- O deploy sera feito automaticamente pelo sistema ao aplicar este plano
