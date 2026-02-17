

# Corrigir configuracoes do Baileys no banco de dados

## Problema
As configuracoes `baileys_server_url` e `baileys_api_key` no banco de dados ainda apontam para o dominio antigo (`chatbotvital.store`) e a API key antiga. A Edge Function `baileys-instance` le esses valores do banco para se comunicar com o servidor Baileys no VPS, por isso o QR Code nao aparece.

## Solucao

### 1. Atualizar os dados no banco
Executar UPDATE nas duas linhas da tabela `system_settings`:

- `baileys_server_url` -> `https://app.chatbotwhatsapp.store/baileys`
- `baileys_api_key` -> `fe29d431262a3e70540b180151e846011a13577f2e8226d9b60eadf7e31c26bb`

### 2. Melhorar o script de instalacao (opcional)
Adicionar ao `deploy/scripts/install-unified.sh` um passo que tambem atualiza o banco Lovable Cloud (via API REST do Supabase) com a URL e API Key corretas, evitando esse problema no futuro.

## Secao Tecnica

A Edge Function `baileys-instance` (linha 65-78) busca `baileys_server_url` e `baileys_api_key` da tabela `system_settings`. Atualmente retorna os valores antigos, fazendo com que toda chamada ao servidor Baileys falhe (dominio errado + chave errada).

Arquivos alterados:
- Nenhum arquivo de codigo precisa mudar
- Apenas os dados na tabela `system_settings` precisam ser atualizados via SQL

