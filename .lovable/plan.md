

## Corrigir Logs de Diagnostico para Mostrar Nome do Atendente, Data e Hora

### Problema identificado

Todos os logs de atividade estao com `user_id = null`, mostrando "Sistema" em vez do nome do atendente. Isso acontece porque:

1. As acoes feitas via **edge functions** (service role key) nao tem `auth.uid()` disponivel - o trigger `log_activity()` nao consegue capturar quem fez a acao
2. As acoes feitas diretamente pelo **frontend** (ex: criar contato, atualizar conversa) devem ter o `user_id` preenchido, mas como muitas operacoes passam por edge functions, a maioria fica sem identificacao

### O que sera feito

**1. Melhorar o trigger `log_activity()` para capturar o usuario de fontes alternativas**

O trigger passara a verificar, alem de `auth.uid()`, campos como `assigned_to` (em conversations), `created_by` (em campaigns, chatbot_flows), e `sender_id` (em messages) para identificar o usuario responsavel.

**2. Melhorar a exibicao na tabela de Logs**

- Coluna **Data/Hora** com formato mais legivel: data em uma linha, hora em outra (ex: "11/02/2026" e "14:42:05")
- Coluna **Atendente** com avatar e nome (ou badge "Sistema" quando for automatico)
- Filtro por **atendente** especifico adicionado aos filtros existentes

**3. Adicionar filtro por Atendente**

- Novo dropdown de filtro para selecionar um atendente especifico
- Busca a lista de profiles para popular o dropdown

### Secao tecnica

**Migration SQL - Atualizar trigger `log_activity()`:**

Modificar a funcao para tentar extrair o user_id de campos da propria tabela quando `auth.uid()` retorna null:

```text
v_user_id := auth.uid();

-- Fallback: tentar extrair de campos da tabela
IF v_user_id IS NULL THEN
  CASE TG_TABLE_NAME
    WHEN 'conversations' THEN v_user_id := COALESCE(NEW.assigned_to, OLD.assigned_to);
    WHEN 'messages' THEN v_user_id := NEW.sender_id;
    WHEN 'campaigns' THEN v_user_id := COALESCE(NEW.created_by, OLD.created_by);
    WHEN 'chatbot_flows' THEN v_user_id := COALESCE(NEW.created_by, OLD.created_by);
    WHEN 'quick_replies' THEN v_user_id := COALESCE(NEW.created_by, OLD.created_by);
    WHEN 'schedules' THEN v_user_id := COALESCE(NEW.user_id, OLD.user_id);
    ELSE NULL;
  END CASE;
END IF;
```

**Arquivo modificado: `src/pages/Diagnostico.tsx`:**

- Coluna Data/Hora: separar data e hora em duas linhas para melhor leitura
- Coluna Atendente: mostrar nome com destaque ou badge "Sistema" quando for acao automatica
- Novo filtro dropdown "Atendente" que lista todos os profiles e filtra por `user_id`
- Melhorar metadata summary para mostrar mais contexto

