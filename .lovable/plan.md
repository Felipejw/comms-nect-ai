

## Melhorias na Documentacao da API - Guia de Inicio Rapido e Exemplos Interativos

### O que sera feito

A pagina de documentacao da API (`src/pages/ApiDocs.tsx`) ja possui a estrutura basica com aviso de URL nao configurada e exemplos estaticos. Vamos aprimora-la com:

### 1. Guia de Inicio Rapido (nova aba "Inicio")
Uma nova aba antes de "Autenticacao" com um passo-a-passo visual numerado:
- **Passo 1**: Configurar a URL base do servidor em Configuracoes (com link direto)
- **Passo 2**: Criar uma chave API em Configuracoes → API Keys (com link direto)
- **Passo 3**: Fazer a primeira chamada (exemplo de health check com cURL pronto para copiar)
- **Passo 4**: Enviar sua primeira mensagem (exemplo completo)

### 2. Exemplos Interativos com Input de API Key
Adicionar um campo de input no topo da pagina onde o usuario pode colar sua API Key temporariamente (apenas em memoria, nao salva). Todos os exemplos de codigo (cURL, JavaScript, Python) serao atualizados automaticamente com a chave digitada, substituindo o placeholder `tf_sua_chave_aqui`.

### 3. Indicador visual de status da configuracao
No topo, mostrar um checklist visual:
- URL Base da API: configurada / nao configurada (com icone verde/vermelho)
- O aviso amarelo existente sera mantido e aprimorado

### Detalhes Tecnicos

**Arquivo modificado:** `src/pages/ApiDocs.tsx`

**Mudancas:**
- Adicionar estado `apiKeyPreview` para armazenar a chave digitada pelo usuario (apenas em memoria)
- Adicionar um `Input` com placeholder "Cole sua API Key aqui para preencher os exemplos" acima das tabs
- Nova aba "inicio" no array de tabs com conteudo de Quick Start usando Cards numerados
- Substituir todas as ocorrencias de `tf_sua_chave_aqui` nos code blocks por `apiKeyPreview || "tf_sua_chave_aqui"` para que os exemplos sejam dinamicos
- Adicionar badges de status (configurado/pendente) para URL base
- Adicionar link `<a href="/configuracoes">` nos passos que mencionam ir ate Configuracoes

Nenhum outro arquivo precisa ser modificado. A logica de aviso e placeholder ja existente sera preservada e aprimorada.

