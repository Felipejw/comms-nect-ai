

# Reescrita Completa das 13 Edge Functions Corrompidas

## Diagnostico Confirmado

13 funcoes backend tiveram sua logica principal substituida por comentarios placeholder (`// ... keep existing code`), o que faz com que elas iniciem, facam o setup, e depois **travem sem retornar resposta**. Isso causa o erro repetitivo nos logs:

```text
TypeError: First argument to 'respondWith' must be a Response 
or a promise resolving to a Response
```

## Funcoes que serao reescritas

O trabalho sera dividido em 3 lotes por prioridade:

### Lote 1 - Funcoes Criticas (WhatsApp e Mensagens) ✅ CONCLUÍDO

| # | Funcao | Status |
|---|--------|--------|
| 1 | send-whatsapp | ✅ Reescrita completa |
| 2 | baileys-webhook | ✅ Reescrita completa |
| 3 | meta-api-webhook | ✅ Reescrita completa |
| 4 | download-whatsapp-media | ✅ Reescrita completa |

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

## AVISO IMPORTANTE SOBRE O VPS

**NAO faca `git pull` no VPS** ate que todas as funcoes estejam reescritas aqui. O VPS ainda tem as versoes antigas funcionais. Se puxar agora, vai substituir pelas versoes quebradas.
