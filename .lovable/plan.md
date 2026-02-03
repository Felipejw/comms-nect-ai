
# Plano: Limpeza Completa de WAHA, WPPConnect e Evolution

## Resumo Executivo

Vou remover todas as referencias a WAHA, WPPConnect e Evolution API do projeto, consolidando exclusivamente o Baileys como engine de WhatsApp via QR Code. O sistema manteve suporte aos engines antigos como fallback durante a transicao, mas agora podem ser completamente removidos.

## Escopo da Limpeza

| Categoria | Arquivos Afetados | Ocorrencias |
|-----------|------------------|-------------|
| Edge Functions | 6 arquivos | ~309 ocorrencias |
| Scripts de Deploy | 8 arquivos | ~400 ocorrencias |
| Docker Compose | 1 arquivo | ~160 ocorrencias |
| Configuracoes | 2 arquivos | Varias |
| **TOTAL** | **17 arquivos** | **~872 ocorrencias** |

---

## Arquivos a Modificar

### Edge Functions (Backend)

| Arquivo | Acao | Mudanca |
|---------|------|---------|
| `supabase/functions/download-whatsapp-media/index.ts` | Modificar | Remover referencias WPPConnect, usar Baileys API |
| `supabase/functions/check-connections/index.ts` | Modificar | Remover Evolution API, usar Baileys API |
| `supabase/functions/execute-flow/index.ts` | Modificar | Substituir sendWhatsAppMessage para usar Baileys |
| `supabase/functions/merge-duplicate-contacts/index.ts` | Modificar | Remover Evolution API para buscar contatos |
| `supabase/functions/sync-contacts/index.ts` | Verificar | Garantir que usa Baileys |
| `supabase/functions/resolve-lid-contact/index.ts` | Verificar | Garantir que usa Baileys |

### Scripts de Deploy

| Arquivo | Acao | Mudanca |
|---------|------|---------|
| `deploy/scripts/install.sh` | Reescrever | Remover escolha WAHA/WPPConnect, usar apenas Baileys |
| `deploy/scripts/install-unified.sh` | Modificar | Remover opcoes legadas |
| `deploy/scripts/backup.sh` | Modificar | Remover backup de volumes WAHA/WPPConnect |
| `deploy/scripts/restore.sh` | Modificar | Remover restore de volumes legados |
| `deploy/scripts/update.sh` | Modificar | Remover logica de engines multiplos |
| `deploy/scripts/diagnostico.sh` | Modificar | Remover checks WAHA/WPPConnect |
| `deploy/scripts/package.sh` | Modificar | Remover diretorios evolution |

### Docker Compose

| Arquivo | Acao | Mudanca |
|---------|------|---------|
| `deploy/docker-compose.yml` | Modificar | Remover servicos WAHA e WPPConnect (linhas 360-575), remover variaveis de ambiente, manter apenas Baileys |

### Configuracoes

| Arquivo | Acao | Mudanca |
|---------|------|---------|
| `deploy/.env.example` | Modificar | Remover secoes WAHA e WPPConnect |
| `deploy/CHANGELOG.md` | Atualizar | Documentar a remocao final |

---

## Detalhes Tecnicos

### 1. Edge Functions - Padrao Baileys

Todas as edge functions que enviam mensagens WhatsApp serao atualizadas para usar este padrao:

```typescript
// Configuracao Baileys
const BAILEYS_API_URL = Deno.env.get("BAILEYS_API_URL") || "http://baileys:3000";
const BAILEYS_API_KEY = Deno.env.get("BAILEYS_API_KEY");

// Enviar mensagem via Baileys
async function sendWhatsAppMessage(
  instanceName: string,
  phone: string,
  content: string
): Promise<boolean> {
  const response = await fetch(`${BAILEYS_API_URL}/send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": BAILEYS_API_KEY,
    },
    body: JSON.stringify({
      sessionId: instanceName,
      to: `${phone}@s.whatsapp.net`,
      text: content,
    }),
  });
  return response.ok;
}
```

### 2. Docker Compose - Servicos Removidos

Serao removidos completamente:
- `waha` (linhas 361-405)
- `wppconnect-1` (linhas 411-444)
- `wppconnect-2` (linhas 446-480)
- `wppconnect-3` (linhas 482-515)
- `wppconnect-lb` (se existir)

### 3. Variaveis de Ambiente Removidas

Do `docker-compose.yml` e `.env.example`:
- `WAHA_API_URL`, `WAHA_API_KEY`, `WAHA_PORT`
- `WPPCONNECT_API_URL`, `WPPCONNECT_SECRET_KEY`, `WPPCONNECT_PORT_*`
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`
- `WHATSAPP_ENGINE` (sera removida pois so existe Baileys)

### 4. Script de Instalacao Simplificado

O `install.sh` atual tem 983 linhas com logica para escolher WAHA/WPPConnect. Sera simplificado para:
- Remover menu de escolha de engine (linhas 233-256)
- Remover criacao de diretorios WAHA/WPPConnect (linhas 329-339)
- Remover verificacao de health WAHA/WPPConnect (linhas 714-758)
- Usar sempre `--profile baileys`

---

## Impacto

### Beneficios

1. **Codigo mais limpo**: Remocao de ~870 linhas de codigo legado
2. **Menos confusao**: Um unico caminho de integracao
3. **Manutencao simplificada**: Menos variaveis de ambiente
4. **Instalacao mais rapida**: Sem perguntas sobre engine

### Riscos

1. **Instalacoes existentes**: Usuarios com WAHA/WPPConnect precisarao migrar
2. **Compatibilidade**: Garantir que Baileys cobre todos os casos de uso

### Mitigacao

- Documentar processo de migracao no CHANGELOG
- Manter backward compatibility no banco de dados

---

## Ordem de Execucao

1. **Edge Functions** (6 arquivos) - Atualizar logica de envio/recebimento
2. **Docker Compose** - Remover servicos e variaveis
3. **.env.example** - Limpar variaveis obsoletas
4. **Scripts** (7 arquivos) - Simplificar instalacao
5. **Testes** - Verificar funcionamento

---

## Comandos de Verificacao (Apos Implementacao)

```bash
# Verificar se ainda existem referencias
grep -r "waha\|wppconnect\|evolution" deploy/ supabase/functions/ --include="*.ts" --include="*.sh" --include="*.yml"

# Reiniciar com novo docker-compose
cd /opt/sistema/deploy
sudo docker compose down
sudo docker compose --profile baileys up -d

# Verificar logs
sudo docker logs app-nginx -f
sudo docker logs baileys-server -f
```
