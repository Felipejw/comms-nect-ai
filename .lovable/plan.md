

# Remover texto "[Audio]" e melhorar visual do player

## Problema

Quando uma mensagem de audio e renderizada, o texto do conteudo (ex: "🎤 Audio") aparece abaixo do player de audio. Isso acontece porque na linha 1092 do `Atendimento.tsx`, o `message.content` e sempre exibido, mesmo quando ja existe um player de audio visivel.

## Solucao

### 1. Ocultar texto para mensagens de audio (`src/pages/Atendimento.tsx`)

Alterar a condicao de renderizacao do conteudo de texto (linha 1092) para nao exibir quando a mensagem for do tipo audio:

```
// De:
{message.content && (

// Para:
{message.content && message.message_type !== "audio" && (
```

### 2. Melhorar visual do AudioPlayer (`src/components/atendimento/AudioPlayer.tsx`)

Atualizar o design do player para um visual mais moderno com ondas animadas:

- Aumentar levemente o tamanho do botao play/pause e adicionar gradiente primario
- Melhorar as barras do waveform com animacao de onda suave durante reproducao
- Adicionar transicoes mais fluidas nas barras
- Arredondar mais o container e adicionar sombra sutil
- Melhorar contraste e espacamento dos elementos de tempo

## Detalhes tecnicos

### Arquivo: `src/pages/Atendimento.tsx` (linha 1092)

Adicionar `message.message_type !== "audio"` na condicao de renderizacao do conteudo textual.

### Arquivo: `src/components/atendimento/AudioPlayer.tsx`

- Container: bordas mais arredondadas (`rounded-xl`), padding maior, fundo com gradiente sutil
- Botao play: circular com fundo primario solido, icone branco
- Waveform: barras com animacao de onda (`scaleY` oscilante) durante reproducao, cantos mais arredondados, cores mais vibrantes
- Tipografia: tempo atual em destaque, duracao total mais sutil
- Remover botao de mute (simplificar interface)
- Aumentar quantidade de barras de 32 para 40 para visual mais detalhado
