

# Corrigir API Key do Baileys no banco de dados

## Problema

A API Key armazenada na tabela `system_settings` esta desatualizada. O bootstrap gerou uma nova chave ao reinstalar, mas o banco de dados ainda tem a chave antiga.

- Banco de dados: `9759d463...b435`
- VPS (real): `9c23d1af...5d39`

A edge function `send-whatsapp` le a chave do banco e envia ao Baileys. Como nao batem, o Baileys rejeita com "Unauthorized".

## Correcao

Atualizar o valor de `baileys_api_key` na tabela `system_settings` para a chave correta do VPS:

```text
9c23d1af8df0df397b2c776b1db712d63314d24be907c60152438e54d5405d39
```

Nenhuma alteracao de codigo e necessaria. Apenas a atualizacao do dado no banco.

## Resultado esperado

Apos a atualizacao:
- O envio de mensagens voltara a funcionar imediatamente
- A edge function `send-whatsapp` enviara a chave correta ao Baileys
- O botao "Testar Conexao" nas Configuracoes tambem validara corretamente

## Detalhes tecnicos

### O que sera feito
- UPDATE na tabela `system_settings` onde `key = 'baileys_api_key'` com o novo valor

### Por que receber funciona mas enviar nao
- **Receber**: Baileys no VPS chama a edge function `baileys-webhook` diretamente. A autenticacao do webhook usa o `SUPABASE_ANON_KEY`, nao a API Key do Baileys.
- **Enviar**: A edge function `send-whatsapp` faz uma requisicao HTTP ao Baileys enviando a `baileys_api_key` do banco como header `X-API-Key`. Com a chave errada, o Baileys retorna 401.

