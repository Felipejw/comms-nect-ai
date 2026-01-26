
# Plano: Integrar WAHA no Script Principal de Instalação

## Objetivo

Modificar o script `deploy/scripts/install.sh` para perguntar durante a instalação qual engine de WhatsApp o usuário deseja usar: **WAHA** ou **WPPConnect**. O sistema irá configurar automaticamente a opção escolhida.

---

## Fluxo de Instalação Proposto

```text
+------------------------------------------------------------------+
|                    FLUXO DE INSTALAÇÃO                           |
+------------------------------------------------------------------+
|                                                                  |
|  [INÍCIO]                                                        |
|      |                                                           |
|      v                                                           |
|  +-------------------+                                           |
|  | Verificar Docker  |                                           |
|  | Compilar Frontend |                                           |
|  +-------------------+                                           |
|      |                                                           |
|      v                                                           |
|  +------------------------------+                                |
|  | Perguntar configurações:     |                                |
|  | - Domínio                    |                                |
|  | - Email SSL                  |                                |
|  | - Senha do banco             |                                |
|  +------------------------------+                                |
|      |                                                           |
|      v                                                           |
|  +------------------------------+     <-- NOVA PERGUNTA          |
|  | Qual engine de WhatsApp?     |                                |
|  | [1] WAHA (Recomendado)       |                                |
|  | [2] WPPConnect               |                                |
|  +------------------------------+                                |
|      |                                                           |
|      +----------+----------+                                     |
|                 |          |                                     |
|      WAHA [1]   |          |   WPPConnect [2]                   |
|                 v          v                                     |
|  +----------------+    +-------------------+                     |
|  | Configurar     |    | Configurar        |                     |
|  | docker-compose |    | docker-compose    |                     |
|  | com WAHA       |    | com WPPConnect    |                     |
|  +----------------+    +-------------------+                     |
|                 |          |                                     |
|                 +----+-----+                                     |
|                      |                                           |
|                      v                                           |
|  +-------------------+                                           |
|  | Iniciar serviços  |                                           |
|  | Health check      |                                           |
|  | Criar admin       |                                           |
|  +-------------------+                                           |
|      |                                                           |
|      v                                                           |
|  [FIM - Exibir credenciais]                                      |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Arquivos a Modificar

### 1. `deploy/scripts/install.sh`

**Modificações:**

1. **Atualizar Banner** (linha 34-40)
   - Atualizar descrição para mencionar suporte a WAHA e WPPConnect

2. **Adicionar Pergunta sobre Engine** (após linha 218, antes de configurar .env)
   - Nova seção perguntando qual engine usar
   - Opção 1: WAHA (Recomendado - mais estável)
   - Opção 2: WPPConnect (Legado)

3. **Gerar Chave Apropriada** (linha 248-251)
   - Se WAHA: gerar `WAHA_API_KEY` com 32 caracteres hex
   - Se WPPConnect: gerar `WPPCONNECT_SECRET_KEY` com 24 caracteres hex

4. **Atualizar Configuração .env** (linha 252-266)
   - Adicionar variáveis condicionais baseadas na engine escolhida
   - `WHATSAPP_ENGINE=waha` ou `WHATSAPP_ENGINE=wppconnect`

5. **Criar Estrutura de Diretórios** (linha 273-284)
   - Condicional: criar diretórios do WAHA ou do WPPConnect

6. **Atualizar docker-compose.yml** (novo)
   - Criar arquivo docker-compose dinâmico baseado na engine
   - Ou usar profiles do Docker Compose para ativar uma ou outra

7. **Health Check Apropriado** (linha 569-614)
   - Se WAHA: verificar `http://localhost:3000/api/health`
   - Se WPPConnect: manter verificação atual `http://localhost:21465/api/`

8. **Atualizar Resumo Final** (linha 659-686)
   - Mostrar URL e instruções específicas da engine escolhida

---

### 2. `deploy/docker-compose.yml`

**Modificações:**

1. **Adicionar serviço WAHA** como alternativa ao WPPConnect
   - Usar Docker Compose profiles para separar
   - Profile `waha`: serviço WAHA
   - Profile `wppconnect`: serviços WPPConnect (existentes)

2. **Atualizar variáveis de ambiente das Edge Functions**
   - Adicionar `WAHA_API_URL` e `WAHA_API_KEY`
   - Usar fallback para manter compatibilidade

---

### 3. `deploy/.env.example`

**Modificações:**

1. **Adicionar seção WAHA**
   - `WHATSAPP_ENGINE=waha`
   - `WAHA_API_KEY=`
   - `WAHA_PORT=3000`

2. **Manter seção WPPConnect** existente para compatibilidade

---

## Detalhes Técnicos da Implementação

### Nova Seção: Escolha de Engine WhatsApp

Será adicionada após a coleta das informações básicas (domínio, email, senha):

```bash
# Escolher Engine de WhatsApp
echo ""
echo -e "${BLUE}Escolha a engine de WhatsApp:${NC}"
echo ""
echo "  [1] WAHA (Recomendado)"
echo "      - Mais estável e moderno"
echo "      - Dashboard de administração incluído"
echo "      - Melhor suporte a mídia"
echo ""
echo "  [2] WPPConnect"
echo "      - Opção legada"
echo "      - Suporte multi-instância"
echo ""

read -p "Digite sua escolha [1/2] (padrão: 1): " WHATSAPP_ENGINE_CHOICE
WHATSAPP_ENGINE_CHOICE=${WHATSAPP_ENGINE_CHOICE:-1}

if [ "$WHATSAPP_ENGINE_CHOICE" = "2" ]; then
    WHATSAPP_ENGINE="wppconnect"
    log_info "Selecionado: WPPConnect"
else
    WHATSAPP_ENGINE="waha"
    log_info "Selecionado: WAHA (Recomendado)"
fi
```

### Docker Compose com Profiles

O `docker-compose.yml` será modificado para usar profiles:

```yaml
services:
  # WAHA - Profile: waha
  waha:
    image: devlikeapro/waha:latest
    profiles:
      - waha
    # ... configurações WAHA

  # WPPConnect - Profile: wppconnect  
  wppconnect-1:
    image: wppconnect/server-cli:latest
    profiles:
      - wppconnect
    # ... configurações existentes
```

O script então inicia com o profile correto:
```bash
if [ "$WHATSAPP_ENGINE" = "waha" ]; then
    $DOCKER_COMPOSE --profile waha up -d
else
    $DOCKER_COMPOSE --profile wppconnect up -d
fi
```

### Variáveis de Ambiente Condicionais

```bash
# Gerar chaves baseado na engine
if [ "$WHATSAPP_ENGINE" = "waha" ]; then
    WAHA_API_KEY=$(openssl rand -hex 32)
    sed -i "s|^WAHA_API_KEY=.*|WAHA_API_KEY=$WAHA_API_KEY|" .env
    sed -i "s|^WHATSAPP_ENGINE=.*|WHATSAPP_ENGINE=waha|" .env
    sed -i "s|^WEBHOOK_URL=.*|WEBHOOK_URL=https://$DOMAIN/functions/v1/waha-webhook|" .env
else
    WPPCONNECT_SECRET_KEY=$(openssl rand -hex 24)
    sed -i "s|^WPPCONNECT_SECRET_KEY=.*|WPPCONNECT_SECRET_KEY=$WPPCONNECT_SECRET_KEY|" .env
    sed -i "s|^WHATSAPP_ENGINE=.*|WHATSAPP_ENGINE=wppconnect|" .env
    sed -i "s|^WEBHOOK_URL=.*|WEBHOOK_URL=https://$DOMAIN/functions/v1/wppconnect-webhook|" .env
fi
```

---

## Resumo das Alterações

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `deploy/scripts/install.sh` | Modificar | Adicionar pergunta sobre engine, lógica condicional |
| `deploy/docker-compose.yml` | Modificar | Adicionar serviço WAHA com profiles |
| `deploy/.env.example` | Modificar | Adicionar variáveis WAHA |

---

## Comportamento Esperado

1. **Usuário executa** `sudo ./scripts/install.sh`

2. **Script pergunta** configurações básicas (domínio, email, senha)

3. **Script pergunta** qual engine usar:
   - `[1] WAHA (Recomendado)` - Opção padrão
   - `[2] WPPConnect`

4. **Script configura** automaticamente:
   - Gera chaves apropriadas
   - Configura docker-compose com profile correto
   - Configura webhook adequado
   - Inicia containers da engine escolhida

5. **Resumo final** mostra:
   - URL do sistema
   - Credenciais da engine escolhida
   - Comandos específicos para a engine

---

## Vantagens da Integração

- **Experiência unificada**: Tudo configurado em um único script
- **Flexibilidade**: Usuário escolhe a engine preferida
- **Compatibilidade**: Mantém suporte ao WPPConnect para quem já usa
- **Simplicidade**: WAHA como padrão recomendado para novos usuários
- **Automação completa**: SSL, Docker, engine - tudo configurado automaticamente
