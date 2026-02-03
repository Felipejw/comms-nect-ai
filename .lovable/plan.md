

# Plano: Configuracao Automatica do Baileys no Sistema

## O Que Sera Feito Automaticamente

Vou realizar TODAS as etapas sem precisar de intervencao manual:

| Etapa | Acao | Status |
|-------|------|--------|
| 1 | Inserir URL e API Key no banco de dados | Automatico |
| 2 | Criar componente de configuracao do Baileys | Automatico |
| 3 | Adicionar na pagina de Opcoes | Automatico |
| 4 | Funcao de testar conexao | Automatico |

---

## Suas Credenciais (Serao Inseridas Automaticamente)

| Configuracao | Valor |
|--------------|-------|
| URL do Servidor | `https://chatbotvital.store` |
| API Key | `9759d46309e1eeae92d423f1ee860177671095af60ead9d23422fb4c8fb8b435` |

---

## Alteracoes no Sistema

### 1. Migracao SQL (Banco de Dados)

Inserir as credenciais na tabela `system_settings`:

```sql
INSERT INTO system_settings (key, value, description, category) 
VALUES 
  ('baileys_server_url', 'https://chatbotvital.store', 'URL do servidor Baileys', 'whatsapp'),
  ('baileys_api_key', '9759d46309e1eeae92d423f1ee860177671095af60ead9d23422fb4c8fb8b435', 'API Key do Baileys', 'whatsapp')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### 2. Criar Componente de Configuracao

**Arquivo:** `src/components/configuracoes/BaileysConfigSection.tsx`

O componente tera:
- Campo para editar URL do servidor
- Campo para editar API Key (com mascara de senha)
- Botao "Salvar" para atualizar as configuracoes
- Botao "Testar Conexao" que verifica se o servidor esta online
- Indicador visual de status (Online/Offline/Nao Configurado)

### 3. Integrar na Pagina de Opcoes

**Arquivo:** `src/components/configuracoes/OptionsTab.tsx`

Adicionar nova secao "Servidor WhatsApp (Baileys)" no topo da pagina com:
- Icone de servidor
- Campos de configuracao
- Status da conexao em tempo real

---

## Visual do Componente

```
+----------------------------------------------------------+
|  Servidor WhatsApp (Baileys)                    [Online] |
|----------------------------------------------------------|
|  URL do Servidor:                                        |
|  [https://chatbotvital.store                        ]    |
|                                                          |
|  API Key:                                                |
|  [*********************************** ] [Mostrar]        |
|                                                          |
|  [Salvar Configuracoes]  [Testar Conexao]               |
+----------------------------------------------------------+
```

---

## Resultado Final

Apos aprovar este plano:

1. As credenciais do Baileys estarao salvas no banco de dados
2. Voce podera gerenciar as credenciais pela interface (Configuracoes > Opcoes)
3. A pagina de Conexoes funcionara para criar novas instancias WhatsApp
4. Todas as edge functions terao acesso as credenciais automaticamente
5. Mensagens poderao ser enviadas/recebidas via Baileys

**Nenhuma acao manual sera necessaria da sua parte apos a aprovacao!**

