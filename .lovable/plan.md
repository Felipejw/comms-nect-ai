
## Ajustes no sistema

### 1. Remover opcao de criar conta na tela de login
- Remover o componente `Tabs` (Entrar / Criar Conta) da pagina `src/pages/Login.tsx`
- Manter apenas o formulario de login direto, sem abas
- Remover imports e codigo relacionados ao signup (signupSchema, signupForm, handleSignup, TabsList, etc.)
- Ajustar o texto "Entre ou crie sua conta" para "Entre com suas credenciais"

### 2. Trocar titulo da aba do navegador
- Alterar o `<title>` em `index.html` de "Lovable App" para "TalkFlow"
- Atualizar tambem os meta tags og:title
- Gerar um favicon SVG com o icone MessageSquare e salvar como `public/favicon.svg`, referenciando no index.html

### 3. Remover opcao de Diagnostico do menu
- Remover o item "Diagnostico" do array de navegacao em `src/components/layout/AppSidebar.tsx`
- Manter a rota no App.tsx para caso alguem acesse diretamente, nao quebrar

### 4. Corrigir erro de RLS ao criar coluna no CRM
- A tabela `kanban_columns` tem politica RLS que exige `is_admin_or_manager()` para INSERT
- Alterar o hook `useCreateKanbanColumn` em `src/hooks/useKanban.ts` para usar `adminWrite()` ao inves de chamada direta ao Supabase
- Fazer o mesmo para `useUpdateKanbanColumn` e `useDeleteKanbanColumn` para consistencia

### Detalhes tecnicos

**Login.tsx**: Remover Tabs, signupSchema, signupForm, handleSignup, TabsContent de signup. Renderizar apenas o form de login diretamente.

**index.html**: 
```html
<title>TalkFlow</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

**AppSidebar.tsx**: Remover a linha com `{ title: "Diagnostico", href: "/diagnostico", icon: HeartPulse, module: "conexoes" }`

**useKanban.ts** - useCreateKanbanColumn: Trocar `supabase.from("kanban_columns").insert()` por `adminWrite({ table: "kanban_columns", operation: "insert", data })`. Mesma abordagem para update e delete.
