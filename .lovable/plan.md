
# Correcao do Log de Atividades que Quebrou o Recebimento de Mensagens

## Causa Raiz

O trigger `log_activity()` criado na fase anterior tem um bug de tipo de dado que esta impedindo o funcionamento de todas as tabelas monitoradas:

- A coluna `entity_id` na tabela `activity_logs` e do tipo `uuid`
- A funcao declara `v_entity_id text` e faz `v_entity_id := v_row.id::text`
- PostgreSQL nao faz cast implicito de `text` para `uuid`
- O trigger falha e faz **rollback de toda a operacao** (INSERT, UPDATE, DELETE)

Isso afeta 7 tabelas: `contacts`, `conversations`, `connections`, `campaigns`, `tags`, `quick_replies`, `chatbot_rules`

## Impacto

- Mensagens recebidas via WhatsApp nao sao salvas (criacao de contato falha no trigger)
- Possivelmente afeta criacao de tags, respostas rapidas, campanhas e outras operacoes CRUD

## Correcao

### 1. Alterar o tipo da coluna `entity_id` de `uuid` para `text`

A solucao mais robusta e mudar a coluna para `text` ao inves de `uuid`, porque:
- Nem todos os `entity_id` sao UUIDs (ex: logs de edge functions podem usar IDs de texto)
- O campo e informativo/de referencia, nao precisa ser UUID estrito
- Evita problemas futuros com qualquer tipo de ID

Migration SQL:
```text
ALTER TABLE public.activity_logs ALTER COLUMN entity_id TYPE text USING entity_id::text;
```

### 2. Corrigir a insercao na edge function `baileys-webhook`

A linha 535 do webhook insere `entity_id: conversation.id` - isso e um UUID valido mas o Supabase JS pode enviar como string. Com a coluna como `text`, isso funciona sem problemas.

### 3. Corrigir insercoes nas outras edge functions

Verificar que todas as edge functions que inserem na `activity_logs` estejam consistentes com o tipo `text` (nenhuma alteracao necessaria pois ja enviam UUIDs como strings).

## Resultado Esperado

- Mensagens WhatsApp voltam a ser recebidas e exibidas normalmente
- Triggers de logging funcionam corretamente em todas as 7 tabelas
- Edge functions registram atividades sem erros
- Nenhum impacto nos dados existentes (tabela estava vazia)
