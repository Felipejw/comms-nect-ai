

# Implementar Import Dinamico no Router VPS

## Problema
O arquivo `supabase/functions/index.ts` usa **imports estaticos** (`import X from './admin-write/index.ts'`). O bundler do Lovable Cloud tenta resolver esses imports durante o empacotamento e falha com `SUPABASE_CODEGEN_ERROR` porque trata cada funcao como isolada.

## Solucao
Trocar todos os 24 imports estaticos por **`await import()` dinamico** dentro do handler. O bundler do Cloud ignora imports dinamicos (sao resolvidos apenas em runtime), enquanto na VPS o Deno consegue acessar `./nome-da-funcao/index.ts` porque o `--main-service` aponta para `/home/deno/functions` (a raiz).

## Alteracoes

### 1. `supabase/functions/index.ts` (reescrever)

Remover todas as 24 linhas de `import ... from` e o mapeamento estatico `FUNCTION_HANDLERS`. Substituir por:

- Uma lista (whitelist) de nomes de funcoes validas (para seguranca, evitando carregar arquivos arbitrarios)
- Um cache de modulos carregados (para nao re-importar a cada requisicao)
- `await import(./${functionName}/index.ts)` dentro do handler, chamando `module.default(req)`

Logica do handler permanece identica (parse do path, CORS, health check, proxy da request).

### 2. `supabase/functions/main/index.ts` (sem alteracao)

Ja esta simplificado como health-check para o Cloud. Nenhuma mudanca necessaria.

### 3. `deploy/docker-compose.yml` (sem alteracao)

Ja aponta `--main-service` para `/home/deno/functions`, que e o necessario para que os imports dinamicos `./` funcionem. Nenhuma mudanca necessaria.

## Detalhes Tecnicos

A whitelist de funcoes validas sera:

```text
admin-write, baileys-create-session, baileys-instance, baileys-webhook,
check-connections, create-user, delete-user, download-whatsapp-media,
execute-campaign, execute-flow, fetch-whatsapp-profile, google-auth,
google-calendar, merge-duplicate-contacts, meta-api-webhook,
process-schedules, reset-user-password, resolve-lid-contact,
save-system-setting, send-meta-message, send-whatsapp, sync-contacts,
update-lid-contacts, update-user-email
```

O cache (`Map<string, Function>`) garante que cada funcao e importada apenas uma vez -- nas chamadas seguintes o modulo ja esta em memoria.

Todas as 24 sub-funcoes ja possuem `export default handler` e a guarda `if (import.meta.main)`, portanto nao precisam de nenhuma alteracao.

## Por que funciona

- **Cloud**: O bundler ve `supabase/functions/index.ts` mas como nao esta dentro de uma subpasta com nome de funcao, ele o ignora. Cada funcao continua sendo deployada isoladamente pela sua propria pasta.
- **VPS**: O Deno inicia em `/home/deno/functions`, e `await import('./admin-write/index.ts')` resolve para `/home/deno/functions/admin-write/index.ts` -- dentro do sandbox, sem violacao.

## Apos implementar

No VPS, rode:

```bash
cd /opt/sistema && git pull origin main
cd deploy
sudo docker compose up -d functions
sleep 5
sudo docker logs supabase-functions --tail 15
```

