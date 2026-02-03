# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

## [3.0.0] - 2025-02-03

### Mudanças Importantes
- **Consolidação para Baileys como único engine WhatsApp (QR Code)**
  - Removido suporte a WAHA
  - Removido suporte a Evolution API
  - Removido suporte a WPPConnect
  - Meta Cloud API continua suportada para conexões oficiais

### Removido
- Edge functions `waha-instance` e `waha-webhook`
- Diretório `deploy/waha/`
- Variáveis de ambiente `WAHA_*`, `EVOLUTION_*`, `WPPCONNECT_*`

### Atualizado
- `send-whatsapp`: Usa apenas Baileys ou Meta API
- `sync-contacts`: Migrado para Baileys API
- `update-lid-contacts`: Migrado para Baileys API
- `resolve-lid-contact`: Migrado para Baileys API
- `process-schedules`: Usa Baileys API diretamente
- `useWhatsAppConnections.ts`: Simplificado, sempre usa `baileys-instance`
- `backup.sh`: Faz backup de `/opt/baileys/sessions` em vez de WPPConnect

### Notas de Migração
Para usuários atualizando da versão 2.x:
1. Conexões existentes com engine WAHA precisarão ser recriadas
2. Instale o servidor Baileys: `curl -fsSL https://seu-servidor/baileys/bootstrap.sh | sudo bash`
3. Configure `baileys_server_url` e `baileys_api_key` em Configurações > Sistema

---

## [2.0.0] - 2025-01-07

### Mudanças Importantes
- **Migração de Evolution API para WPPConnect Server**
  - Resolução nativa de números LID (privacidade do WhatsApp)
  - API mais simples e documentada
  - Melhor estabilidade nas conexões

### Adicionado
- Suporte completo ao WPPConnect Server
- Endpoint dedicado para resolver LID (`/contact/pn-lid/{pnLid}`)
- Health check automático do WPPConnect no script de instalação
- Retry automático para serviços que demoram a iniciar
- Scripts de backup, restore e update atualizados para WPPConnect

### Alterado
- `docker-compose.yml`: Substituído container Evolution por WPPConnect
- Todas as edge functions de WhatsApp atualizadas para WPPConnect
- Documentação atualizada para refletir nova arquitetura
- `.env.example`: Variáveis de Evolution removidas, WPPConnect adicionadas

### Removido
- Dependência da Evolution API
- Variáveis `EVOLUTION_*` do ambiente

### Notas de Migração
Para usuários atualizando da versão 1.x:
1. Faça backup: `./scripts/backup.sh`
2. Atualize as variáveis no `.env`:
   - Remova: `EVOLUTION_API_KEY`, `EVOLUTION_PORT`, `EVOLUTION_SERVER_URL`
   - Adicione: `WPPCONNECT_SECRET_KEY`, `WPPCONNECT_PORT=21465`
3. Execute: `./scripts/update.sh`
4. Reconecte suas instâncias WhatsApp (será necessário escanear QR Code novamente)

---

## [1.0.0] - 2025-01-01

### Adicionado
- Sistema de atendimento WhatsApp completo
- Dashboard com métricas em tempo real
- Kanban de leads com drag-and-drop
- Chatbot visual com Flow Builder
- Multi-usuários com sistema de permissões
- Respostas rápidas
- Tags para organização
- Campanhas de mensagens em massa
- Agendamentos de mensagens
- Chat interno entre atendentes
- Integração com Google Calendar
- Sistema de filas de atendimento
- Relatórios e estatísticas
- Personalização de marca (white-label)

### Segurança
- Autenticação JWT
- Row Level Security (RLS) em todas as tabelas
- Senhas criptografadas
- HTTPS obrigatório

---

## Formato de Atualizações

Para instalar uma atualização:

1. Faça backup: `./scripts/backup.sh`
2. Baixe o arquivo de atualização (ex: `v3.0-update.zip`)
3. Extraia sobre a instalação existente
4. Execute: `./scripts/update.sh`
5. Verifique os logs: `docker-compose logs -f`
