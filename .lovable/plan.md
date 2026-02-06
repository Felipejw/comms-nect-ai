
# Atualizar o Pacote Self-Hosted para Banco de Dados Independente

## Situacao Atual

Seu projeto ja tem uma infraestrutura de deploy self-hosted muito bem construida na pasta `deploy/`:

- Docker Compose com PostgreSQL, GoTrue (Auth), PostgREST (API), Kong (Gateway), Realtime, Storage, Edge Functions, Baileys e Nginx
- Script de instalacao automatizada (`install-unified.sh`) que gera todas as credenciais
- Script de empacotamento (`package.sh`) que cria ZIPs para distribuicao
- Frontend com suporte a configuracao em runtime (`window.__SUPABASE_CONFIG__`)

O problema e que o `deploy/supabase/init.sql` esta **desatualizado**. Ele nao inclui:

| O que falta | Impacto |
|-------------|---------|
| 7 tabelas (tenants, subscription_plans, tenant_subscriptions, subscription_payments, products, sales, tenant_settings, message_templates) | Erro ao acessar funcionalidades SaaS |
| Coluna `tenant_id` em 29 tabelas | Frontend quebra ao fazer queries |
| Enum `super_admin` no app_role | Funcao `is_super_admin()` falha |
| 9 funcoes auxiliares (is_super_admin, get_user_tenant_id, can_access_tenant, etc.) | RLS policies nao funcionam |
| Politicas RLS tenant-aware | Dados sem isolamento |
| Coluna `name_source` em contacts, `media_type` em campaigns, etc. | Campos faltando |
| Criacao automatica do admin + tenant | Cliente nao consegue logar |

## Solucao

Reescrever o `deploy/supabase/init.sql` para espelhar 100% o schema atual do banco Cloud, e ajustar o script de instalacao para criar automaticamente o primeiro admin com seu tenant.

---

## Parte 1: Atualizar `deploy/supabase/init.sql`

Reescrever o arquivo completo com:

### 1.1 Adicionar enum `super_admin`
O enum `app_role` no init.sql atual tem apenas `admin`, `manager`, `operator`. Precisa incluir `super_admin`.

### 1.2 Adicionar todas as funcoes auxiliares que faltam
- `is_super_admin(_user_id uuid)`
- `get_user_tenant_id(_user_id uuid)`
- `can_access_tenant(_user_id uuid, _tenant_id uuid)`
- `get_tenant_plan_limits(_tenant_id uuid)`
- `tenant_has_active_subscription(_tenant_id uuid)`
- `normalize_phone(phone_input text)`
- `log_activity()` (trigger function)
- `increment_campaign_delivered(campaign_id uuid)`
- `increment_campaign_read(campaign_id uuid, was_delivered boolean)`

### 1.3 Adicionar coluna `tenant_id` em todas as tabelas
Adicionar `tenant_id uuid` em: profiles, contacts, contact_tags, tags, conversations, conversation_tags, messages, connections, campaigns, campaign_contacts, chatbot_rules, chatbot_flows, flow_nodes, flow_edges, queues, queue_agents, kanban_columns, schedules, quick_replies, integrations, google_calendar_events, ai_settings, api_keys, activity_logs, chat_messages, system_settings, message_templates.

### 1.4 Adicionar tabelas faltantes
- `tenants` - Registro de cada empresa/cliente
- `subscription_plans` - Planos disponiveis (Basico, Profissional, Enterprise)
- `tenant_subscriptions` - Assinatura ativa do tenant
- `subscription_payments` - Historico de pagamentos
- `products` - Produtos para venda
- `sales` - Registro de vendas
- `tenant_settings` - Configuracoes por tenant
- `message_templates` - Templates de mensagem

### 1.5 Atualizar todas as politicas RLS
Substituir todas as politicas simples pelas versoes tenant-aware que usam `is_super_admin()`, `get_user_tenant_id()` e `can_access_tenant()`.

### 1.6 Adicionar colunas faltantes em tabelas existentes
- `contacts`: `name_source text DEFAULT 'auto'`
- `contacts`: `is_group boolean DEFAULT false`
- `campaigns`: `use_variations boolean`, `use_buttons boolean`, `buttons jsonb`, `min_interval integer`, `max_interval integer`, `template_id uuid`, `message_variations text[]`, `media_type text`
- `campaign_contacts`: `retry_count integer`, `next_retry_at timestamp`, `last_error text`
- `profiles`: `signature_enabled boolean DEFAULT false`

### 1.7 Dados iniciais para planos
Inserir os 3 planos de assinatura com limites:
- Basico: 3 usuarios, 1 conexao WhatsApp, 500 contatos
- Profissional: 10 usuarios, 3 conexoes, 5000 contatos
- Enterprise: ilimitado

---

## Parte 2: Atualizar Script de Instalacao

### 2.1 Criar admin automaticamente
Adicionar uma etapa no `install-unified.sh` que, apos o banco iniciar, cria:
1. Um usuario admin via GoTrue API
2. Um tenant vinculado ao admin
3. Promove o usuario para `super_admin`
4. Cria uma subscription trial de 30 dias
5. Injeta as credenciais do Baileys no `system_settings`

### 2.2 Salvar credenciais em arquivo
Adicionar criacao do arquivo `CREDENCIAIS.txt` com:
- URL de acesso
- Email e senha do admin
- API Key do Baileys
- Senha do banco de dados

### 2.3 Aguardar banco ficar pronto
Adicionar verificacao de health do banco antes de criar o admin (loop com timeout).

---

## Parte 3: Ajustar `handle_new_user()` no init.sql

A funcao `handle_new_user()` atual no init.sql nao inclui `super_admin` no role. Atualizar para que funcione com o novo schema.

---

## Resumo dos Arquivos

| Arquivo | Acao |
|---------|------|
| `deploy/supabase/init.sql` | Reescrever completo - sincronizar com schema Cloud |
| `deploy/scripts/install-unified.sh` | Adicionar criacao de admin + tenant + credenciais |

## O que NAO muda

- Nenhuma alteracao no frontend ou backend Cloud
- A experiencia de desenvolvimento continua igual
- O Docker Compose ja esta correto
- O Nginx ja esta correto
- Os scripts de backup/restore/update continuam iguais

## Resultado Final

Quando voce rodar `./scripts/package.sh`, o ZIP gerado contera tudo que o cliente precisa. Ele roda `sudo ./scripts/install-unified.sh` e em 5 minutos tem:
- Banco de dados PostgreSQL proprio com todo o schema
- Admin criado automaticamente
- Tenant configurado com trial de 30 dias
- Baileys integrado e funcionando
- SSL configurado
- Arquivo CREDENCIAIS.txt com todas as informacoes de acesso
