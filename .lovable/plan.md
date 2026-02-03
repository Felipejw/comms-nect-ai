
# Plano: Instalacao 100% Automatica (Zero Prompts)

## Problema Identificado

O script de instalacao ainda possui varios prompts interativos que impedem a instalacao em um unico comando:

| Arquivo | Linha | Prompt Interativo |
|---------|-------|-------------------|
| `install.sh` | 262-263 | Confirmar sobrescrever .env |
| `install.sh` | 283 | Dominio do servidor |
| `install.sh` | 284 | Email SSL |
| `install.sh` | 285 | Senha do banco de dados |
| `install.sh` | 1042-1045 | Email/Senha/Nome do admin |
| `install-unified.sh` | 173-179 | Dominio e Email SSL |
| `bootstrap.sh` | 57-58 | Confirmar reinstalacao |

Alem disso, o prompt "Escolha a engine de WhatsApp: WAHA/WPPConnect" que voce esta vendo **nao existe no codigo atual**. Isso significa que voce esta executando uma versao **antiga** do script no servidor que nao foi atualizada apos o clone do repositorio.

---

## Solucao: Automatizar Tudo

Vou modificar os scripts para:

1. **Gerar senha do banco automaticamente** (sem pedir ao usuario)
2. **Gerar credenciais do admin automaticamente** (sem pedir ao usuario)
3. **Aceitar dominio como argumento** ou usar IP automatico
4. **Remover todos os prompts interativos**
5. **Exibir credenciais geradas no final**

---

## Mudancas Tecnicas

### Arquivo 1: `deploy/scripts/install.sh`

**Remocao de prompts interativos:**

- Linhas 260-274: Remover confirmacao de sobrescrever .env (sempre sobrescrever)
- Linhas 277-292: Aceitar DOMAIN como variavel de ambiente ou argumento, gerar senha automaticamente
- Linhas 1038-1045: Gerar email/senha/nome do admin automaticamente

**Novas funcionalidades:**

```bash
# Gerar senha do banco automaticamente
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

# Gerar credenciais do admin automaticamente
ADMIN_EMAIL="admin@${DOMAIN}"
ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
ADMIN_NAME="Administrador"
```

### Arquivo 2: `deploy/scripts/install-unified.sh`

**Remocao de prompts interativos:**

- Linhas 173-179: Aceitar DOMAIN e SSL_EMAIL como variaveis de ambiente

### Arquivo 3: `deploy/scripts/bootstrap.sh`

**Remocao de prompts interativos:**

- Linhas 55-68: Automatizar reinstalacao (fazer backup e continuar)

---

## Uso Apos Implementacao

### Instalacao Rapida (IP automatico)
```bash
curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/scripts/bootstrap.sh | sudo bash
```

### Instalacao com Dominio
```bash
curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/scripts/bootstrap.sh | sudo DOMAIN=chatbotvital.store SSL_EMAIL=seu@email.com bash
```

### Instalacao Local
```bash
cd /opt/sistema/deploy
sudo DOMAIN=chatbotvital.store ./scripts/install.sh
```

---

## Credenciais Geradas Automaticamente

No final da instalacao, o script exibira:

```text
============================================
   INSTALACAO CONCLUIDA!
============================================

Credenciais de Acesso:
  URL:   https://chatbotvital.store
  Admin: admin@chatbotvital.store
  Senha: xK7mP9nQ2wL5vB3r (gerada automaticamente)

Banco de Dados:
  Senha: Ab3dEf7hIj9kLmNo0pQr5tUv (gerada automaticamente)

API Keys:
  Baileys API Key: abc123...
  ANON_KEY: eyJhbG...
  SERVICE_ROLE_KEY: eyJhbG...

GUARDE ESSAS INFORMACOES EM LOCAL SEGURO!
============================================
```

---

## Resultado Esperado

Apos aprovar este plano:

- **ZERO prompts interativos** durante a instalacao
- Comando unico instala tudo automaticamente
- Credenciais seguras geradas automaticamente
- Todas as configuracoes exibidas no final
- Dominio pode ser passado via variavel de ambiente
- Se dominio nao informado, usa IP publico do servidor
