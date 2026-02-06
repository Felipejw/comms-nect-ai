

# Tornar o Log de Atividades Totalmente Funcional

## Problema Atual

A tabela `activity_logs` existe no banco de dados com a estrutura correta e politicas RLS configuradas, porem esta **completamente vazia (0 registros)**. Apenas a edge function `send-meta-message` insere logs - todas as outras funcoes do sistema nao registram nenhuma atividade.

## Solucao

Implementar logging de atividades em dois niveis:

1. **Triggers no banco de dados** - Para capturar automaticamente operacoes CRUD em tabelas criticas (nao depende de codigo no frontend)
2. **Logging nas edge functions** - Para capturar acoes que passam pelas funcoes de backend

Alem disso, melhorar a interface do `Diagnostico.tsx` com filtros e paginacao.

---

## Fase 1 - Trigger automatico de logging no banco de dados

Criar uma funcao PostgreSQL `log_activity()` e triggers nas tabelas principais para registrar automaticamente:

| Tabela | Acoes Registradas |
|--------|-------------------|
| `contacts` | Criacao, atualizacao, exclusao de contatos |
| `conversations` | Criacao e mudanca de status |
| `connections` | Criacao, mudanca de status, exclusao |
| `campaigns` | Criacao, atualizacao de status |
| `tags` | Criacao, exclusao |
| `quick_replies` | Criacao, atualizacao, exclusao |
| `chatbot_rules` | Criacao, atualizacao, exclusao |

A funcao `log_activity()` vai:
- Capturar a acao (INSERT/UPDATE/DELETE)
- Registrar o `entity_type` e `entity_id`
- Associar o `user_id` via `auth.uid()` (quando disponivel)
- Associar o `tenant_id` da linha afetada
- Armazenar campos relevantes no `metadata` (ex: campo de status antes e depois)

## Fase 2 - Logging nas Edge Functions criticas

Adicionar insercoes na tabela `activity_logs` nas seguintes edge functions:

| Edge Function | Acao Registrada |
|---------------|-----------------|
| `send-whatsapp` | `send_message` - envio de mensagem via Baileys |
| `baileys-webhook` | `receive_message` - mensagem recebida de contato |
| `create-user` | `create` usuario |
| `execute-campaign` | `execute_campaign` - execucao de campanha |
| `execute-flow` | `execute_flow` - execucao de chatbot |
| `reset-user-password` | `reset_password` |
| `baileys-create-session` | `create` conexao/sessao |

## Fase 3 - Melhorias na interface do Diagnostico

Aprimorar a secao "Log de Atividades" do `Diagnostico.tsx`:

1. **Filtros** - Permitir filtrar por:
   - Tipo de acao (criar, atualizar, excluir, mensagem, login)
   - Tipo de entidade (contato, conversa, campanha, etc.)
   - Periodo (ultimas 24h, 7 dias, 30 dias)

2. **Paginacao** - Carregar mais registros sob demanda (50 por pagina)

3. **Contador total** - Exibir total de eventos recentes no card de resumo

4. **Mapeamento completo de acoes** - Expandir os labels para cobrir todas as novas acoes

---

## Detalhes Tecnicos

### Funcao de trigger `log_activity()`

```text
CREATE OR REPLACE FUNCTION log_activity()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = 'public'
AS $$
  - Determina action: INSERT -> 'create', UPDATE -> 'update', DELETE -> 'delete'
  - Extrai entity_type do TG_TABLE_NAME
  - Extrai entity_id do NEW.id ou OLD.id
  - Extrai tenant_id do NEW.tenant_id ou OLD.tenant_id
  - Captura auth.uid() como user_id (NULL para operacoes de sistema/service_role)
  - Salva metadata com campos relevantes (ex: status antigo e novo)
  - Insere na activity_logs
$$;
```

### Triggers criados (um por tabela, AFTER INSERT OR UPDATE OR DELETE)

Cada trigger chama a mesma funcao `log_activity()`, que detecta automaticamente a tabela e operacao via variaveis de trigger (`TG_OP`, `TG_TABLE_NAME`).

### Insercao nas Edge Functions

Padrao uniforme para todas as funcoes:

```text
await supabaseAdmin.from("activity_logs").insert({
  tenant_id: <tenant_id da operacao>,
  user_id: <user.id quando autenticado>,
  action: "<acao>",
  entity_type: "<tipo>",
  entity_id: <id da entidade>,
  metadata: { <detalhes relevantes> }
});
```

### Filtros na interface

Novos estados no componente:
- `actionFilter`: string (todas, create, update, delete, send_message, etc.)
- `entityFilter`: string (todas, contact, conversation, campaign, etc.)
- `periodFilter`: string (24h, 7d, 30d)

A query sera atualizada para aplicar `.eq()` e `.gte()` conforme os filtros selecionados.

