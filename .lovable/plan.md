

# Corrigir Mismatch da API Key entre Banco de Dados e Container Baileys

## Problema identificado
A API Key armazenada no banco de dados (tabela `system_settings`, chave `baileys_api_key`) nao corresponde a API Key que o container Docker esta realmente usando. Isso causa erro 401 (Unauthorized) em todas as chamadas da Edge Function para o servidor Baileys.

- **Banco de dados:** `9759d46309e1eeae92d423f1ee860177671095af60ead9d23422fb4c8fb8b435`
- **Container Docker:** `0d78af0a61951a38561d29bc759d7f4d12a09d88837d4881cdca786b80652686`

O container ignora o arquivo `.env` editado, provavelmente por existir uma variavel de ambiente ja definida no sistema do VPS, ou algum outro mecanismo de cache.

## Solucao

Atualizar o valor da API Key no banco de dados (`system_settings`) para usar a chave que o container realmente possui.

### Passo 1 - Atualizar a API Key no banco de dados
Executar uma atualizacao na tabela `system_settings` para que a chave `baileys_api_key` contenha o valor `0d78af0a61951a38561d29bc759d7f4d12a09d88837d4881cdca786b80652686`.

Isso pode ser feito de duas formas:
- **Opcao A (recomendada):** Atualizar via a pagina de Configuracoes do sistema, onde o campo "API Key do Baileys" pode ser editado diretamente
- **Opcao B:** Adicionar um botao/funcao na tela de Configuracoes que permita sincronizar a chave automaticamente

### Passo 2 - Verificar e melhorar tratamento de erros
Na Edge Function `baileys-instance`, melhorar a mensagem de erro quando ocorre um 401 para que fique mais claro que a causa e um mismatch de API Key (em vez da mensagem generica "Verifique a configuracao do nginx/proxy").

### Passo 3 - Adicionar diagnostico na tela de Conexoes
Quando houver erro de autenticacao (401) na comunicacao com o Baileys, mostrar uma mensagem mais descritiva na UI indicando que a API Key configurada no sistema nao corresponde a do servidor.

## Detalhes tecnicos

### Atualizacao no banco de dados
A Edge Function `baileys-instance` le a API Key da tabela `system_settings` com a query:
```text
SELECT value FROM system_settings WHERE key = 'baileys_api_key'
```
E a usa no header `X-API-Key` ao fazer chamadas para o servidor Baileys.

### Arquivos a serem alterados

1. **supabase/functions/baileys-instance/index.ts**
   - Melhorar a mensagem de erro quando o servidor Baileys retorna 401, diferenciando de outros erros HTTP
   - Adicionar log especifico para facilitar diagnostico

2. **src/components/configuracoes/BaileysConfigSection.tsx** (se necessario)
   - Verificar se ja existe campo para editar a API Key
   - Se nao existir, adicionar campo editavel

### Atualizacao imediata
Atualizar a chave `baileys_api_key` no banco de dados para `0d78af0a61951a38561d29bc759d7f4d12a09d88837d4881cdca786b80652686` via SQL direto, para resolver o bloqueio imediatamente.

## Resultado esperado
Apos a atualizacao, a Edge Function `baileys-instance` enviara a chave correta no header `X-API-Key`, o servidor Baileys aceitara as requisicoes, e a tela de Conexoes funcionara normalmente (exibindo QR Code, status, etc.).

