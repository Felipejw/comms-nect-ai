
# Plano de Correção: Validação da URL do Baileys

## Problema Identificado
A URL do servidor Baileys no banco de dados está configurada como `https://chatbotvital.store/baileys/health`, mas deveria ser apenas `https://chatbotvital.store/baileys`. 

A edge function `baileys-instance` adiciona automaticamente `/health` ao fazer o teste de conexão (linha 390), resultando em uma URL duplicada: `https://chatbotvital.store/baileys/health/health` que retorna 404 ou erro.

## Solução em Duas Etapas

### Etapa 1: Correção Imediata (Ação do Usuário)
Alterar a URL na interface de configuracoes:
- **De**: `https://chatbotvital.store/baileys/health`
- **Para**: `https://chatbotvital.store/baileys`

### Etapa 2: Adicionar Validação Automatica (Implementacao)
Modificar o componente `BaileysConfigSection.tsx` para:

1. **Remover sufixos indesejados automaticamente** ao salvar:
   - Remover `/health` do final
   - Remover `/` do final (trailing slash)
   
2. **Garantir que `/baileys` esteja presente** quando a URL base for configurada sem ele

3. **Mostrar aviso visual** se a URL parecer incorreta

## Arquivo a Modificar
`src/components/configuracoes/BaileysConfigSection.tsx`

## Mudancas Tecnicas

```typescript
// Funcao para normalizar a URL antes de salvar
const normalizeUrl = (url: string): string => {
  let normalized = url.trim();
  
  // Remover trailing slashes
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  
  // Remover /health do final se existir
  if (normalized.endsWith('/health')) {
    normalized = normalized.slice(0, -7);
  }
  
  return normalized;
};

// No handleSave, normalizar a URL antes de salvar
const handleSave = async () => {
  const normalizedUrl = normalizeUrl(serverUrl);
  setServerUrl(normalizedUrl); // Atualizar o state tambem
  
  await createOrUpdateSetting.mutateAsync({
    key: "baileys_server_url",
    value: normalizedUrl, // Usar URL normalizada
    // ...
  });
};
```

## Beneficios
- Previne erros de configuracao futuros
- Experiencia de usuario mais robusta
- Evita URLs duplicadas como `/health/health`

## Validacao
Apos implementar, testar:
1. Digitar URL com `/health` no final - deve ser removido automaticamente
2. Digitar URL com `/` no final - deve ser removido automaticamente
3. Testar conexao deve funcionar corretamente
