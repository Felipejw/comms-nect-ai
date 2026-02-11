

## Sistema de Backup Completo na Pagina de Configuracoes

### Visao geral

Adicionar uma nova aba "Backup" na pagina de Configuracoes que permite ao administrador exportar e importar todos os dados do sistema diretamente pela interface web, sem necessidade de acesso ao servidor VPS.

---

### Funcionalidades

**Exportar Backup (Download)**
- Gera um arquivo JSON contendo todos os dados do sistema
- Tabelas incluidas: contacts, conversations, messages, tags, contact_tags, conversation_tags, quick_replies, chatbot_rules, chatbot_flows, flow_nodes, flow_edges, queues, queue_agents, campaigns, campaign_contacts, kanban_columns, connections, integrations, ai_settings, system_settings, profiles, user_roles, user_permissions, schedules, message_templates, activity_logs
- Barra de progresso mostrando o andamento da exportacao
- Download automatico do arquivo `.json` com timestamp no nome
- Metadados incluidos: versao, data, total de registros por tabela

**Importar Backup (Restauracao)**
- Upload de arquivo JSON previamente exportado
- Validacao do formato do arquivo antes de iniciar
- Preview mostrando quantos registros serao restaurados por tabela
- Confirmacao obrigatoria antes de executar (dialog de alerta)
- Processo de restauracao com progresso por tabela
- Usa upsert para evitar conflitos de chave duplicada

**Restricoes de acesso**
- Apenas usuarios admin podem ver e usar a aba de Backup
- A aba nao aparece para operadores e managers

---

### Secao tecnica

**Arquivos criados:**

1. `src/components/configuracoes/BackupTab.tsx`
   - Componente principal da aba de backup
   - Secao "Exportar": botao que consulta todas as tabelas via Supabase client, monta objeto JSON e dispara download via `Blob` + `URL.createObjectURL`
   - Secao "Importar": input de arquivo, validacao, preview, dialog de confirmacao, e loop de upsert por tabela
   - Progress bar (componente `Progress` ja existente) para feedback visual
   - Tratamento de tabelas com FK: importacao na ordem correta (contacts antes de conversations, conversations antes de messages, etc.)

**Arquivos modificados:**

2. `src/pages/Configuracoes.tsx`
   - Importar `BackupTab` e `useAuth`
   - Adicionar aba "Backup" condicional (`isAdmin`)
   - Nova `TabsTrigger` e `TabsContent` para backup

**Ordem de exportacao/importacao das tabelas (respeitando dependencias):**

```text
1. profiles, user_roles, user_permissions
2. tags, kanban_columns, queues
3. queue_agents
4. contacts, contact_tags
5. connections
6. chatbot_flows, chatbot_rules
7. flow_nodes, flow_edges
8. conversations, conversation_tags
9. messages
10. campaigns, campaign_contacts
11. quick_replies, schedules
12. message_templates
13. integrations, ai_settings
14. system_settings
15. activity_logs
```

**Limites e paginacao:**
- Tabelas grandes (messages, activity_logs) serao exportadas em lotes de 1000 registros para evitar timeout
- Loop com `.range(offset, offset + 999)` ate nao haver mais dados

**Formato do arquivo de backup:**

```text
{
  "meta": {
    "version": "1.0",
    "created_at": "2026-02-11T...",
    "tables": { "contacts": 150, "messages": 5000, ... }
  },
  "data": {
    "contacts": [...],
    "conversations": [...],
    ...
  }
}
```

**Dependencias:** Nenhuma nova - usa apenas componentes UI ja existentes (Button, Progress, Card, AlertDialog, Input) e o cliente Supabase.
