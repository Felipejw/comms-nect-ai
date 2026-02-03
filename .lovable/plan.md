# Plano: Instalação Simplificada em Um Comando

## ✅ IMPLEMENTADO

Todas as correções foram aplicadas com sucesso:

### Mudanças Realizadas

| Arquivo | Mudança | Status |
|---------|---------|--------|
| `deploy/scripts/install.sh` | Reescrito com Kong após variáveis JWT | ✅ Completo |
| `deploy/scripts/install.sh` | Inserir configurações Baileys no DB | ✅ Completo |
| `deploy/scripts/install.sh` | Gerar nginx.conf programaticamente | ✅ Completo |
| `deploy/scripts/install.sh` | Adicionar validação pre-start | ✅ Completo |
| `deploy/scripts/install.sh` | Melhorar verificação do frontend build | ✅ Completo |
| `deploy/supabase/init.sql` | Adicionar configs Baileys padrão | ✅ Completo |

---

## Como Usar

### Instalação Limpa

```bash
cd /opt/sistema/deploy
sudo ./scripts/install.sh
```

### O que o script faz automaticamente:

1. Verifica e instala Docker/Docker Compose se necessário
2. Compila o frontend se não existir
3. Gera chaves JWT (ANON_KEY, SERVICE_ROLE_KEY)
4. Gera kong.yml COM as chaves corretas (sem erro de sintaxe)
5. Gera nginx.conf completo
6. Gera certificado SSL (Let's Encrypt ou auto-assinado)
7. Valida toda a configuração ANTES de iniciar
8. Inicia containers Docker
9. Executa migrations do banco
10. Insere configurações do Baileys no banco
11. Cria usuário administrador

---

## Resultado

Após executar `sudo ./scripts/install.sh`:

- ✅ Kong inicia corretamente (sem erros de sintaxe)
- ✅ Nginx serve o frontend compilado
- ✅ Baileys configurado automaticamente no banco
- ✅ Sistema funcional imediatamente após instalação
