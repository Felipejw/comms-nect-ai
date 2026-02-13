
# Tornar o botão de Modo Escuro mais discreto

## Mudanca proposta

Em vez de ocupar uma linha inteira na sidebar (igual ao botao "Configuracoes" e "Sair"), o toggle de tema sera movido para o canto do perfil do usuario, como um pequeno icone ao lado do nome.

### Implementacao

**Arquivo:** `src/components/layout/AppSidebar.tsx`

1. **Remover** o botao de modo escuro da secao de botoes do rodape (linhas 177-184)
2. **Adicionar** um pequeno icone-botao (16x16) ao lado do perfil do usuario, na area que ja mostra nome/email (linha 169, ao lado do bloco de texto)
3. Quando a sidebar estiver colapsada, o icone ficara posicionado como um pequeno indicador sobre o avatar

**Arquivo:** `src/components/layout/AppLayout.tsx` (header mobile)

4. Reduzir o tamanho do botao de tema no header mobile de `h-5 w-5` para `h-4 w-4` e usar `size="sm"` para ficar mais sutil

### Resultado visual

**Antes (desktop):**
```text
[Avatar] Nome do Usuario
         email@email.com
[icon] Configuracoes
[icon] Modo Escuro       <-- linha inteira dedicada
[icon] Sair
```

**Depois (desktop):**
```text
[Avatar] Nome do Usuario  [sol/lua pequeno]
         email@email.com
[icon] Configuracoes
[icon] Sair
```

O botao fica como um icone de 28x28px sem texto, posicionado discretamente ao lado do perfil, reduzindo a quantidade de itens no rodape e deixando a interface mais limpa.
