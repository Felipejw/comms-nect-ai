

## Modo Noturno (Dark Mode)

### Situacao atual

O projeto ja possui as variaveis CSS para modo escuro definidas no `src/index.css` (classe `.dark`) e o pacote `next-themes` esta instalado. Porem, nao ha um `ThemeProvider` envolvendo a aplicacao nem um botao para alternar entre os modos.

### Alteracoes necessarias

**1. Adicionar ThemeProvider no App.tsx**

Envolver a aplicacao com o `ThemeProvider` do `next-themes`, configurado para usar a classe `dark` no `<html>` e com o tema padrao `light`.

**2. Criar botao de alternancia no AppSidebar**

Adicionar um botao com icones Sol/Lua na parte inferior da sidebar para que o usuario possa alternar entre modo claro e escuro. O estado sera persistido automaticamente pelo `next-themes` via `localStorage`.

**3. Ajustar BrandingProvider para respeitar o tema**

O sistema de branding atual aplica cores via CSS vars inline, o que funciona em ambos os modos. Nenhuma alteracao necessaria no branding -- as cores customizadas continuarao sobrescrevendo as variaveis, e o modo escuro usara as variaveis `.dark` como fallback para propriedades nao customizadas.

### Resumo tecnico

| Arquivo | Alteracao |
|---|---|
| `src/App.tsx` | Envolver com `ThemeProvider` do `next-themes` |
| `src/components/layout/AppSidebar.tsx` | Adicionar botao Sun/Moon para alternar tema |
| `src/components/layout/AppLayout.tsx` | Adicionar botao no header mobile |

### Resultado esperado

- Botao de alternancia claro/escuro na sidebar (desktop) e no header (mobile)
- Transicao suave entre os modos
- Preferencia salva automaticamente no navegador
- Compativel com o sistema de cores customizaveis existente

