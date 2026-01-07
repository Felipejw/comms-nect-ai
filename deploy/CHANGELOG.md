# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

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
2. Baixe o arquivo de atualização (ex: `v2.1-update.zip`)
3. Extraia sobre a instalação existente
4. Execute: `./scripts/update.sh`
5. Verifique os logs: `docker-compose logs -f`
