

# Corrigir API Key do Baileys - Banco de Dados e Container

## Problema
A API Key no banco de dados foi alterada incorretamente para `0d78af0a...` na tentativa anterior. A chave correta (da instalacao) e `9759d46309e1eeae92d423f1ee860177671095af60ead9d23422fb4c8fb8b435`.

Alem disso, o container Docker ignora o arquivo `.env` porque provavelmente existe uma variavel de ambiente `API_KEY` definida no shell do sistema, que tem prioridade sobre o `.env`.

## Solucao

### Passo 1 - Corrigir a chave no banco de dados
Atualizar `system_settings` para usar a chave correta: `9759d46309e1eeae92d423f1ee860177671095af60ead9d23422fb4c8fb8b435`

### Passo 2 - Instrucoes para corrigir o container Docker
O container precisa ser recriado forcando a variavel de ambiente correta. Sera necessario executar no VPS:

```text
cd /opt/baileys
sudo docker compose down
sudo API_KEY=9759d46309e1eeae92d423f1ee860177671095af60ead9d23422fb4c8fb8b435 docker compose up -d
```

Ou alternativamente, verificar se ha uma variavel de ambiente no sistema:

```text
echo $API_KEY
env | grep API_KEY
```

Se existir, remover com `unset API_KEY` antes de recriar o container.

### Passo 3 - Melhorar a tela de Conexoes para mostrar erros
Atualmente quando o QR Code falha, a tela fica apenas "carregando" indefinidamente. Vamos melhorar para:
- Mostrar mensagem de erro clara quando a API Key e invalida
- Parar o polling apos detectar erro 401
- Exibir botao de "Tentar Novamente" em vez de ficar carregando infinitamente

## Detalhes tecnicos

### Arquivo: src/pages/Conexoes.tsx
- No modal de QR Code, ao detectar erro na busca do QR (especialmente 401), exibir mensagem de erro em vez de manter o spinner de carregamento infinito
- Melhorar a logica de polling para parar imediatamente ao receber erro de autenticacao

### Arquivo: src/hooks/useWhatsAppConnections.ts
- Adicionar tratamento especifico para erros de API Key invalida no `getQrCode` e `checkStatus`
- Propagar o tipo de erro (auth vs network vs server) para que a UI possa reagir adequadamente

### Atualizacao no banco de dados
Executar UPDATE na tabela `system_settings` para corrigir o valor da chave `baileys_api_key` para `9759d46309e1eeae92d423f1ee860177671095af60ead9d23422fb4c8fb8b435`.

## Resultado esperado
Apos a correcao no banco e no container, a Edge Function enviara a chave correta, o servidor Baileys aceitara as requisicoes, e o QR Code sera exibido normalmente na tela de Conexoes. Caso haja erro, uma mensagem descritiva sera mostrada em vez do spinner infinito.
