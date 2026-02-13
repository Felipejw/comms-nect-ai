
# API Externa - Sistema de Conexao via API

## Resumo
Criar um sistema completo de API externa que permita a sistemas terceiros se conectarem ao TalkFlow para enviar/receber mensagens, consultar contatos, conversas e mais. Inclui: gerenciamento de chaves API na interface, uma Edge Function gateway que valida as chaves, e uma pagina de documentacao interativa.

## O que sera criado

### 1. Edge Function: `api-gateway` (nova)
Gateway central que recebe todas as chamadas externas autenticadas via API Key (header `X-API-Key`).

**Endpoints disponiveis:**

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | /api-gateway/messages/send | Enviar mensagem WhatsApp |
| GET | /api-gateway/contacts | Listar contatos |
| GET | /api-gateway/contacts/:id | Buscar contato por ID |
| POST | /api-gateway/contacts | Criar contato |
| GET | /api-gateway/conversations | Listar conversas |
| GET | /api-gateway/conversations/:id/messages | Mensagens de uma conversa |
| GET | /api-gateway/connections | Status das conexoes |
| GET | /api-gateway/health | Health check |

**Fluxo de autenticacao:**
1. Recebe header `X-API-Key` com a chave no formato `tf_xxxx...`
2. Extrai o prefixo (`tf_xxxx`) para localizar a chave na tabela `api_keys`
3. Gera o hash SHA-256 da chave completa e compara com `key_hash`
4. Verifica `is_active` e `expires_at`
5. Atualiza `last_used_at`
6. Valida `permissions` (read, write, send) para a operacao solicitada

### 2. Pagina de Gerenciamento de API Keys (frontend)
Nova pagina `/configuracoes` na aba existente ou nova secao "API" com:
- **Criar chave**: nome, permissoes (ler, escrever, enviar mensagens), data de expiracao opcional
- **Listar chaves**: tabela com nome, prefixo, permissoes, ultimo uso, status
- **Revogar chave**: desativar uma chave existente
- **Copiar chave**: a chave completa so aparece UMA VEZ ao criar (nao e armazenada em texto)

### 3. Pagina de Documentacao da API (frontend)
Nova pagina `/api-docs` acessivel pelo menu lateral, com documentacao interativa contendo:
- Autenticacao (como usar o header X-API-Key)
- Todos os endpoints com exemplos em cURL, JavaScript e Python
- Codigos de erro e respostas
- Limites e boas praticas

### 4. Registro no Router (VPS)
Adicionar `api-gateway` na lista `VALID_FUNCTIONS` dos arquivos `main/index.ts` e `index.ts`.

---

## Detalhes Tecnicos

### Edge Function `api-gateway/index.ts`

```text
Autenticacao:
  Header: X-API-Key: tf_abc123...
  
  Busca na tabela api_keys:
    WHERE key_prefix = 'tf_abc1' (primeiros 7 chars)
    AND is_active = true
    
  Valida SHA-256(chave_completa) === key_hash
  Verifica expires_at > now()
  Atualiza last_used_at
```

**Permissoes granulares:**
- `read` - GET em contatos, conversas, mensagens, conexoes
- `write` - POST/PUT em contatos
- `send` - POST para envio de mensagens

### Frontend - Componente `ApiKeysTab.tsx`

Sera adicionado como nova aba em Configuracoes:
- Formulario para criar chave com campos: nome, permissoes (checkboxes), expiracao
- Gera chave aleatoria no backend (`crypto.randomUUID` + prefixo `tf_`)
- Exibe a chave completa apenas uma vez em um dialog com botao de copiar
- Lista chaves existentes com opcoes de revogar

### Frontend - Pagina `ApiDocs.tsx`

Pagina com documentacao completa, organizada em secoes com Tabs:
- **Autenticacao**: Como obter e usar a chave
- **Enviar Mensagem**: POST com body `{ phone, message, mediaUrl?, mediaType? }`
- **Contatos**: CRUD de contatos
- **Conversas**: Listar e consultar mensagens
- **Conexoes**: Verificar status
- **Webhooks** (futuro): Placeholder para configuracao de webhooks de saida

### Arquivos que serao criados/modificados:

| Arquivo | Acao |
|---------|------|
| `supabase/functions/api-gateway/index.ts` | Criar - Edge Function gateway |
| `src/pages/ApiDocs.tsx` | Criar - Pagina de documentacao |
| `src/components/configuracoes/ApiKeysTab.tsx` | Criar - Gerenciamento de chaves |
| `src/pages/Configuracoes.tsx` | Modificar - Adicionar aba "API" |
| `src/components/layout/AppSidebar.tsx` | Modificar - Adicionar link "API Docs" no menu |
| `src/App.tsx` | Modificar - Adicionar rota /api-docs |
| `supabase/functions/main/index.ts` | Modificar - Registrar api-gateway |
| `supabase/functions/index.ts` | Modificar - Registrar api-gateway |
| `supabase/config.toml` | Modificar - Registrar api-gateway com verify_jwt=false |

### Seguranca
- Chaves sao armazenadas apenas como hash SHA-256 (nunca em texto puro)
- Prefixo de 7 caracteres para busca rapida sem expor a chave
- Permissoes granulares por chave
- Rate limiting basico (futuro)
- Somente admins podem criar/revogar chaves (RLS ja existente na tabela `api_keys`)
