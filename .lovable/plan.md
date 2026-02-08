
# Corrigir Permissoes de Escrita no VPS

## Diagnostico

As funcoes RLS (`is_admin_or_manager`, `has_role`, etc.) agora existem e retornam `true` para o admin. Porem, em instalacoes self-hosted do Supabase, o role PostgreSQL `authenticated` (usado pelo PostgREST para todas as operacoes de usuarios logados) precisa de permissoes **explicitas** de `GRANT ALL` nas tabelas do schema `public`.

Sem essas permissoes, mesmo que o RLS permita a operacao, o PostgreSQL bloqueia a escrita por falta de privilegio a nivel de tabela -- o que resulta exatamente no erro que voce esta vendo ao tentar salvar.

## Solucao Imediata (rodar no VPS)

Execute este comando para conceder permissoes de escrita ao role `authenticated` em todas as tabelas e sequences:

```bash
sudo docker exec supabase-db psql -U postgres -c "
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon;
"
```

Em seguida, reinicie o PostgREST para limpar o cache de schema:

```bash
cd /opt/sistema/deploy && sudo docker compose --profile baileys restart rest
```

## Verificacao

Depois de rodar os comandos acima, tente salvar as configuracoes do Baileys novamente na interface. Se precisar de mais diagnostico, rode:

```bash
# Testar se o authenticated consegue acessar a tabela
sudo docker exec supabase-db psql -U postgres -c "
  SELECT has_table_privilege('authenticated', 'public.system_settings', 'INSERT');
  SELECT has_table_privilege('authenticated', 'public.system_settings', 'UPDATE');
  SELECT has_table_privilege('authenticated', 'public.system_settings', 'SELECT');
"
```

Os 3 resultados devem retornar `t` (true).

## Sobre a Conexao Baileys

Apos conseguir salvar a URL e API Key, a conexao com o servidor Baileys deve funcionar automaticamente. O fluxo e:

1. Voce salva a URL (`https://155.117.41.226/baileys`) e a API Key na tela de configuracoes
2. Na tela de Conexoes, ao criar uma instancia, o sistema chama a Edge Function `baileys-instance`
3. Essa funcao le a URL e API Key do `system_settings` e faz a requisicao ao servidor Baileys

Se mesmo apos salvar as configuracoes a conexao nao funcionar, o problema estara na comunicacao entre a Edge Function e o container Baileys -- mas primeiro precisamos resolver o salvamento.

## Alteracoes no Codigo

Nenhuma alteracao de codigo e necessaria. O problema e puramente de permissoes do banco de dados no VPS.
