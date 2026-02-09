

# Reescrita Completa das 13 Edge Functions Corrompidas

## Diagnostico Confirmado

13 funcoes backend tiveram sua logica principal substituida por comentarios placeholder (`// ... keep existing code`), o que faz com que elas iniciem, facam o setup, e depois **travem sem retornar resposta**. Isso causa o erro repetitivo nos logs:

```text
TypeError: First argument to 'respondWith' must be a Response 
or a promise resolving to a Response
```

## Funcoes que serao reescritas

O trabalho sera dividido em 3 lotes por prioridade:

### Lote 1 - Funcoes Criticas (WhatsApp e Mensagens)

| # | Funcao | Responsabilidade |
|---|--------|-----------------|
| 1 | send-whatsapp | Envia mensagens via Baileys ou Meta API |
| 2 | baileys-webhook | Recebe mensagens e eventos do WhatsApp |
| 3 | meta-api-webhook | Recebe webhooks da API Meta/Facebook |
| 4 | download-whatsapp-media | Baixa e armazena midias recebidas |

Estas sao as mais criticas porque sem elas o WhatsApp nao funciona (nao envia nem recebe mensagens).

### Lote 2 - Funcoes de Gestao (Usuarios e Contatos)

| # | Funcao | Responsabilidade |
|---|--------|-----------------|
| 5 | create-user | Cria usuarios com role e permissoes |
| 6 | delete-user | Remove usuarios do sistema |
| 7 | reset-user-password | Reseta senha de usuarios |
| 8 | sync-contacts | Sincroniza contatos do WhatsApp |
| 9 | fetch-whatsapp-profile | Busca foto e status do perfil |

### Lote 3 - Funcoes de Automacao (Campanhas e Agendamentos)

| # | Funcao | Responsabilidade |
|---|--------|-----------------|
| 10 | check-connections | Health check periodico das conexoes |
| 11 | merge-duplicate-contacts | Limpeza de contatos duplicados |
| 12 | execute-campaign | Disparo de campanhas em massa |
| 13 | process-schedules | Processamento de agendamentos |

## Como sera feito

Para cada funcao, o codigo sera reescrito completo baseado em:

- Estrutura do banco de dados (tabelas, colunas, tipos)
- Padroes ja estabelecidos nas funcoes que funcionam (admin-write, baileys-instance, execute-flow)
- Contexto de memoria sobre a arquitetura (Baileys engine, LID handling, etc.)

Cada funcao incluira:
- Tratamento CORS completo
- Logging detalhado para debugging
- Retorno de Response em TODOS os caminhos do codigo
- Tratamento de erros robusto
- Export padrao compativel com o router VPS

## Detalhes Tecnicos

### send-whatsapp
- Recebe `conversationId`, `content`, `messageType`, `mediaUrl`
- Autentica o usuario via token JWT
- Busca a conversa e o contato associado
- Detecta se o contato usa LID ou telefone normal
- Roteia para Baileys (via fetch para servidor Baileys) ou Meta API
- Salva a mensagem no banco apos envio

### baileys-webhook
- Recebe eventos do servidor Baileys: `qr.update`, `session.status`, `message`
- Encontra a conexao pelo session name
- Para `qr.update`: salva o QR code na tabela connections
- Para `session.status`: atualiza status da conexao
- Para `message`: cria/encontra contato, cria/atualiza conversa, salva mensagem, dispara execute-flow se chatbot ativo
- Suporta midia (imagem, audio, video, documento) via base64
- Resolve LID para telefone real em background

### meta-api-webhook
- Suporta GET (verificacao do webhook pela Meta) e POST (recebimento de mensagens)
- Processa mensagens de texto, imagem, audio, video, documento
- Processa status updates (sent, delivered, read) com metricas de campanha

### download-whatsapp-media
- Recebe base64 da midia ou mediaId
- Armazena no bucket `whatsapp-media` do Storage
- Retorna URL publica

### create-user
- Autentica chamador e verifica role admin
- Cria usuario via `supabase.auth.admin.createUser`
- Atribui role e permissoes

### delete-user
- Autentica e verifica admin
- Remove usuario via `supabase.auth.admin.deleteUser`
- Limpa dados relacionados

### reset-user-password
- Autentica e verifica admin
- Reseta senha via `supabase.auth.admin.updateUserById`

### sync-contacts
- Busca contatos do servidor Baileys
- Sincroniza com a tabela contacts do banco
- Trata duplicatas

### fetch-whatsapp-profile
- Busca info de perfil via Baileys API
- Retorna foto, status, ultimo visto

### check-connections
- Verifica cada conexao WhatsApp ativa
- Consulta status no servidor Baileys
- Atualiza status no banco

### merge-duplicate-contacts
- Identifica contatos com mesmo telefone
- Mescla conversas e tags
- Remove duplicatas

### execute-campaign
- Busca campanhas com status `sending` ou agendadas
- Para cada contato da campanha, envia mensagem via send-whatsapp
- Respeita intervalos min/max entre envios
- Atualiza contadores (sent, delivered, failed)
- Suporta retry com backoff exponencial

### process-schedules
- Busca agendamentos pendentes com horario passado
- Envia mensagem programada
- Atualiza status do agendamento

## AVISO IMPORTANTE SOBRE O VPS

**NAO faca `git pull` no VPS** ate que todas as funcoes estejam reescritas aqui. O VPS ainda tem as versoes antigas funcionais. Se puxar agora, vai substituir pelas versoes quebradas.

## Estimativa

Devido ao volume (13 funcoes completas), a implementacao sera feita em 3-4 mensagens, uma por lote.

