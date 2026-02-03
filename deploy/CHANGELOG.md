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
- Edge functions: Referências a `EVOLUTION_API_*` e `WPPCONNECT_*`
- Docker Compose: Serviços `waha`, `wppconnect-1/2/3`, `wppconnect-lb`
- Variáveis de ambiente: `WAHA_*`, `EVOLUTION_*`, `WPPCONNECT_*`, `WHATSAPP_ENGINE`
- Scripts: Lógica de escolha de engine e verificações de health para engines legados

### Atualizado
- `docker-compose.yml`: Simplificado, apenas Baileys como engine WhatsApp
- `download-whatsapp-media`: Usa apenas Baileys API
- `check-connections`: Migrado para Baileys API
- `merge-duplicate-contacts`: Migrado para Baileys API
- `install.sh`: Simplificado, sem menu de escolha de engine
- `update.sh`: Usa apenas `--profile baileys`
- `diagnostico.sh`: Verifica apenas Baileys
- `restore.sh`: Restaura sessões do Baileys
- `backup.sh`: Faz backup de `/opt/baileys/sessions`
- `.env.example`: Apenas variáveis do Baileys

### Notas de Migração
Para usuários atualizando da versão 2.x:
1. Conexões existentes com engine WAHA/WPPConnect precisarão ser recriadas
2. Execute: `docker compose --profile baileys up -d`
3. Configure `baileys_server_url` e `baileys_api_key` em Configurações > Sistema

---

## [2.0.0] - 2025-01-07

### Mudanças Importantes
- **Migração de Evolution API para WPPConnect Server**
  - Resolução nativa de números LID (privacidade do WhatsApp)
  - API mais simples e documentada
  - Melhor estabilidade nas conexões

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
