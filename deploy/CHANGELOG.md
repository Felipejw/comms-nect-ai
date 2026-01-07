# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

## [1.0.0] - 2025-01-07

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
2. Baixe o arquivo de atualização (ex: `v1.1-update.zip`)
3. Extraia sobre a instalação existente
4. Execute: `./scripts/update.sh`
5. Verifique os logs: `docker-compose logs -f`
