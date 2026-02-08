
# Corrigir Erros de Infraestrutura Self-Hosted

## Diagnostico

Baseado nos logs que voce enviou, identifiquei **2 problemas** na instalacao:

### Problema 1: Realtime em loop de restart
O servico `supabase-realtime` esta crashando com o erro:
```
ERROR 3F000 (invalid_schema_name) no schema has been selected to create in
```
**Causa**: O schema `_realtime` nao existe no banco de dados. O servico Realtime precisa desse schema para armazenar suas tabelas de migracoes internas. A configuracao do Docker Compose define `DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'`, mas esse schema nunca e criado no `init.sql` nem no script de instalacao.

### Problema 2: Storage unhealthy
O servico `supabase-storage` esta marcado como unhealthy. Provavelmente precisa de permissoes adicionais no banco para operar corretamente.

### Impacto no Frontend
Os erros "Failed to fetch" ao salvar configuracoes sao consequencia direta desses servicos instáveis -- o frontend tenta conectar via realtime e falha, causando o travamento.

---

## Solucao

### Passo 1: Comando imediato para corrigir agora (rodar no VPS)

Voce precisa criar o schema `_realtime` e conceder permissoes. Rode este comando no VPS:

```bash
sudo docker exec supabase-db psql -U postgres -c "
  CREATE SCHEMA IF NOT EXISTS _realtime;
  GRANT ALL ON SCHEMA _realtime TO supabase_admin;
  ALTER DEFAULT PRIVILEGES IN SCHEMA _realtime GRANT ALL ON TABLES TO supabase_admin;
  ALTER DEFAULT PRIVILEGES IN SCHEMA _realtime GRANT ALL ON SEQUENCES TO supabase_admin;
"
```

Depois reinicie os servicos instáveis:

```bash
cd /opt/sistema/deploy && sudo docker compose --profile baileys restart realtime storage
```

Aguarde ~30 segundos e verifique:

```bash
sudo docker compose --profile baileys ps
```

Todos os servicos devem estar `Up (healthy)`.

### Passo 2: Corrigir o init.sql para futuras instalacoes

Adicionar a criacao do schema `_realtime` no arquivo `deploy/supabase/init.sql`, logo apos a criacao do schema `extensions`, para que futuras reinstalacoes nao tenham esse problema.

Tambem adicionar no `install-unified.sh` a criacao do schema na etapa de roles/schemas, garantindo que mesmo se o init.sql rodar antes, o schema ja exista.

### Passo 3: Corrigir o install-unified.sh

Na secao onde os schemas sao criados (onde ja existe `CREATE SCHEMA IF NOT EXISTS auth;`), adicionar:

```sql
CREATE SCHEMA IF NOT EXISTS _realtime;
GRANT ALL ON SCHEMA _realtime TO supabase_admin;
```

---

## Arquivos a modificar

1. **`deploy/supabase/init.sql`** -- Adicionar `CREATE SCHEMA IF NOT EXISTS _realtime;` + grants apos linha 11
2. **`deploy/scripts/install-unified.sh`** -- Adicionar criacao do schema `_realtime` na secao de roles/schemas (apos `CREATE SCHEMA IF NOT EXISTS auth;` na linha 756)

## Resultado esperado

- Realtime para de reiniciar em loop
- Storage volta a ficar healthy
- Frontend consegue salvar configuracoes sem "Failed to fetch"
- Futuras instalacoes limpas nao terao esse problema
