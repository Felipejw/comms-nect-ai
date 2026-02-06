

# Deploy da Edge Function baileys-create-session

## Causa raiz identificada

A Edge Function `baileys-create-session` existe no codigo fonte mas **nao esta deployada** no servidor. Ao chamar diretamente, o servidor retorna:

```text
{"code":"NOT_FOUND","message":"Requested function was not found"}
```

### Fluxo do problema

1. Usuario clica em "Criar Conexao" ou "Tentar Novamente"
2. A funcao `baileys-instance` cria o registro no banco e delega a criacao da sessao para `baileys-create-session`
3. Mas essa funcao nao existe no servidor - retorna 404
4. A sessao nunca e criada no servidor Baileys (0 sessoes ativas)
5. O polling tenta buscar QR Code para uma sessao inexistente - recebe 404 do Baileys
6. Apos 5 tentativas, exibe erro

### Solucao

Fazer o deploy da funcao `baileys-create-session`. Nenhuma alteracao de codigo e necessaria - a funcao ja esta escrita corretamente e configurada no `config.toml`. Basta forcar o deploy.

### Passo 1 - Deplovar a funcao
Forcar o deploy da Edge Function `baileys-create-session` que ja existe no codigo.

### Passo 2 - Recriar a sessao
Apos o deploy, acionar o `recreate` na conexao existente para que a funcao delegada funcione e crie a sessao no servidor Baileys, gerando o QR Code.

### Passo 3 - Verificacao
Confirmar que:
- A funcao responde corretamente (nao mais 404)
- O servidor Baileys mostra 1 sessao ativa
- O QR Code aparece na tela de Conexoes

## Detalhes tecnicos

### Arquivo: supabase/functions/baileys-create-session/index.ts
O arquivo ja esta completo e funcional. Sera deployado sem alteracoes de codigo. Apenas sera necessario um "touch" no arquivo (adicionar um comentario na primeira linha) para que o sistema de build reconheca uma alteracao e faca o deploy.

### Validacao pos-deploy
Apos o deploy, sera feita uma chamada direta a funcao para confirmar que esta acessivel e funcionando.

