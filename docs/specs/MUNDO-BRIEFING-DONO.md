# Briefing do dono — novo mundo, história e mapas (2026-10-11)

> Texto do dono, transcrito quase literalmente (só organizado). É a FONTE das especificações `MUNDO-HISTORIA-CAMPANHA.md` e `MUNDO-TERRENO-MAPAS.md`. Em caso de dúvida, vale este texto.

## Referências visuais (em `docs/refs/mundo/`)
- `terreno-orc-deserto.webp` — **terreno orc**: predominantemente DESÉRTICO (dunas, capim seco, rochas, pântano com vitórias-régias nas margens, trilhas de terra). HUD de referência (ouro, madeira, suprimento; minimapa circular com moldura de pedra; painel de comandos).
- `terreno-humano-exuberante.webp` — **terreno humano**: vegetação mais EXUBERANTE (pradaria verde, árvores densas, litoral com água turquesa e areia, costa IRREGULAR, rochas).
- `mapa-mundi-referencia.png` — mapa-múndi "antigo" (pergaminho, continentes de contorno IRREGULAR, ilhas, rosa dos ventos, selo de cera, moldura ornamental): referência para a tela do MAPA DO MUNDO e para o formato dos continentes/ilhas.
O dono pede: **registrar as imagens e as tarefas** para melhorar a aparência do terreno (criar elementos novos se preciso), seguindo as imagens como modelo. Isso exige Blender/navegador (local); na nuvem só se especifica.

## Problema a resolver nos mapas
- "Vejo uma necessidade de retrabalhar os mapas e o terreno; eles receberam atenção muito baixa."
- Os mapas atuais são **como fractais de esferas interligadas** (ilhas/lobos circulares ligados por pontes): o dono **não gosta**. Devem parecer **mapas de verdade**, com **bordas mais irregulares como na natureza** (contorno de continente e de ilha irregular, enseadas, penínsulas, baías, arquipélagos de formas variadas).
- Ter **diferentes tipos de terreno**: uma ilha mais pedregosa, outra vulcânica etc.

## A história do jogo (resumo do dono)
1. Existe **um planeta**, onde **dois continentes permaneceram separados por milhões de anos**.
2. Em cada continente, **geografia diferente**:
   - Um tem **desertos, pântanos e estepes**; nesse terreno evoluiu **fauna e flora diferentes** (por isso os humanos têm ovelhas pelo campo e os orcs têm porcos — "eu mudaria para **javalis**").
   - O outro tem **terrenos montanhosos nevados, florestas e savanas**, onde se desenvolveram **os humanos**.
   (Referências visuais: humano = exuberante; orc = desértico. A atribuição exata de cada continente a cada facção deve ser confirmada na spec.)
3. À medida que as civilizações cresciam, **começaram a navegar em busca de terras e recursos** e, **inevitavelmente, encontraram-se**.
4. O interesse mútuo em **controlar as ilhas entre os continentes** — **cabeça de ponte militar** e **extração de recursos** — levou ao conflito.
5. Mais tarde, **a facção que conseguiu se estabelecer tenta fundar uma colônia no continente alheio**, de onde projeta **um ataque final**.
6. **Ao iniciar a campanha, deve haver uma tela especial que conta essa história**: como surgiram até o momento do encontro e do conflito.
7. **As missões são desenvolvidas com base nessa linha histórica.**

## Estrutura da campanha (desejo do dono)
- Liberar unidades e tecnologias **mais rápido**; **um novo personagem por missão**, de modo que **pouco depois da metade da campanha (~40 % dela)** já se possa jogar **com todos os recursos possíveis do jogo**.
- **12 missões**: as **primeiras 6** vão **liberando opções** (incrementando como um tutorial, das coisas mais simples às avançadas); nas **últimas 6, tudo liberado**.
- Nas **últimas 3**, **os heróis citados pela história** ao longo da campanha podem ser **liberados como jogáveis**.
- **Final (vitória):** o **estabelecimento de uma fortaleza no continente do adversário, bloqueando o acesso às ilhas** e assim eliminando a ameaça do outro.
- **Gancho** para uma campanha futura (**expulsão ou conquista**), **deixado em aberto**.
- (Continua valendo: usar todos os tipos de unidade; tela final especial com imagem de vitória da facção e epílogo.)

## Tarefa pedida
"Escreva as especificações do que lhe for possível." Se for possível desenhar mapas, melhor; senão, pelo menos as especificações com os detalhes acima.
