

## Corrigir URL da API na Documentacao

### Problema
A pagina de documentacao da API usa `window.location.origin` como fallback quando a configuracao `api_base_url` nao esta definida. Isso faz com que os exemplos mostrem a URL do Lovable (preview) em vez do dominio real do usuario.

### Solucao
Alterar a logica em `src/pages/ApiDocs.tsx` para:

1. **Priorizar** a configuracao `api_base_url` (ja existe no sistema via `useSystemSettings`)
2. **Fallback** para um placeholder claro como `https://seu-dominio.com` em vez de `window.location.origin`
3. **Adicionar um aviso** na pagina orientando o usuario a configurar a URL base da API nas Configuracoes caso ela ainda nao esteja definida

### Detalhes Tecnicos

**`src/pages/ApiDocs.tsx`** (linha 54):
- De: `const apiUrl = getSetting("api_base_url") || window.location.origin;`
- Para: `const apiUrl = getSetting("api_base_url") || "https://seu-dominio.com";`
- Adicionar um alerta visivel quando `api_base_url` nao estiver configurada, informando o usuario para ir em Configuracoes e definir a URL base da API do servidor dele

**`src/pages/Configuracoes.tsx`** ou **`src/components/configuracoes/OptionsTab.tsx`**:
- Verificar se ja existe um campo para configurar `api_base_url` nas configuracoes. Se nao existir, adicionar um campo de input na aba de configuracoes para que o usuario defina o endereco do servidor dele (ex: `https://api.meudominio.com`)

