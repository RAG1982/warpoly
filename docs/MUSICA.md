# Música do WarPoly — catálogo, escolha das faixas e evolução

Tudo é **sintetizado** (osciladores + filtros, sem samples) e **determinístico fora da simulação** (nada em `src/sim`;
sem `Math.random`/`Date.now` nas partituras; o RNG de áudio é o de `createAudioRng`). O relógio é o do `AudioContext`.

## 1. Onde fica cada coisa

| Arquivo | Papel |
|---|---|
| `src/audio/music/catalog.js` | **Fonte única**: `MUSIC_CATALOG`, `getTrack`, `isTrackEnabled(id, seleção?)`, `enabledVariants`, `enabledForGroup`, leitura/gravação da seleção. |
| `src/audio/music/musicEngine.js` | Motor de partitura (puro): modos, acordes, compassos (`4/4 3/4 5/4 6/8 7/8…`), notação de linha, geração de notas por passo, intensidade. |
| `src/audio/music/musicScores.js` | Registro das faixas: as 3 clássicas de cada família + `TRACK_SETS` (importa os arquivos abaixo). |
| `tracksHuman.js` / `tracksOrc.js` / `tracksTitle.js` | Candidatas novas do Reino e da Horda, e os temas de abertura. |
| `trackKit.js` | Construtores compactos de camada (`P`, `H`, `DR`, `LN`, `each`, `peace`). |
| `intensity.js` | `intensityFromGameTime(segundos)` → 0..1 (evolução pelo tempo de partida). |
| `MusicPlayer.js`, `instruments.js` | Player incremental e instrumentos (cravo, violinos, violoncelos, trombones, coro, órgão, tímpanos, gongo, sino… além dos antigos). |
| `src/inspector/musicPanel*.js`, `musicPreview.js` | Painel **Músicas** do inspetor (modelo puro, HTML puro, DOM e controlador de áudio). |

## 2. Como escolher as faixas que tocam no jogo

1. `npx vite --port 5173` e abra **`/inspector.html`** → botão **🎵 Músicas** (ou `/inspector.html?panel=music`).
2. Clique em ▶ numa faixa (o `AudioContext` só nasce nesse clique). A lista é agrupada: **Abertura**, **Reino/paz**,
   **Reino/combate**, **Horda/paz**, **Horda/combate**, **Vitória/Derrota** e **Candidatas novas**.
3. Marque **No jogo** nas que devem entrar. A escolha é salva na hora em `localStorage['warpoly.music.selection']`
   como `{"version":1,"enabled":["id", …]}` — o **jogo honra a mesma seleção na mesma máquina** (inclusive a abertura).
4. Botões do cartão: **Ouvir transição paz → combate** (paz → crossfade para o combate da facção → paz), **Só ouvir os
   marcados** (uma volta de cada, em círculo), **Copiar seleção (JSON)** (cole no chat para o repositório adotar como
   padrão), **Restaurar padrões**. Também há volume, laço e **Evolução no tempo** (intensidade 0–100 %).
5. Para o repositório adotar a escolha: ajuste `inGame`/`candidate` em `INFO` (`catalog.js`) conforme o JSON copiado.

**Regras de seleção**: sem seleção salva valem os padrões `inGame` do catálogo. Se uma categoria/facção ficar **sem
faixas habilitadas**, o jogo usa as **atuais** (não candidatas) como reserva — por isso, hoje (combate todo desligado),
o jogo ainda toca as 3 de combate clássicas até o dono marcar as novas. O jogo sorteia entre as habilitadas de forma
determinística (`pickVariant`, nunca repete a anterior) e faz rodízio a cada 3 voltas quando há mais de uma.

## 3. Catálogo

As atuais de **combate** estão `inGame:false` por padrão (o dono não gostou): continuam audíveis no inspetor para comparação.
Todas as novas são candidatas (`candidate:true`, `inGame:false`). "Volta" = duração de uma volta no andamento base.
A lista viva (com descrições e instrumentos) está no painel do inspetor; as tabelas abaixo refletem o repositório.

### Abertura (tela inicial e menus)

| id | título | andamento · compasso · modo · volta | No jogo (padrão) |
|---|---|---|---|
| `title_0` | Marcha da Tempestade | 96 bpm · 4/4 · Ré menor harmônico · 1:40 | sim |
| `title_1` | Réquiem das Muralhas | 84 bpm · 4/4 · Lá menor · 1:31 | não (candidata) |
| `title_2` | Chamado dos Tambores | 104 bpm · 5/4 · Mi frígio · 1:32 | não (candidata) |

`title_0` abre com caixas e tambores marchando, entra a Horda (trombones/trompas), cai num suspense quase silencioso
(órgão e dobres de sino), as cordas trágicas dos humanos crescem, explode em tutti com tímpanos, dialoga metais × cordas e
fecha num **acorde suspenso (sus4)** que desemboca limpo na marcha do começo (laço do menu).

### Reino / paz — `human_peace` (3 atuais + 5 candidatas)

| id | título | andamento · compasso · modo · volta | No jogo (padrão) |
|---|---|---|---|
| `human_peace_0` | Alvorada na Muralha | 120 bpm · 4/4 · Sol maior · 0:16 | sim |
| `human_peace_1` | Estandarte ao Vento | 124 bpm · 4/4 · Ré dórico · 0:15 | sim |
| `human_peace_2` | Passo da Guarda Real | 126 bpm · 4/4 · Dó maior · 0:15 | sim |
| `human_peace_3` | Corte de Cristal | 100 bpm · 4/4 · Ré maior · 0:38 | não |
| `human_peace_4` | Fanfarra do Rei | 112 bpm · 4/4 · Dó maior · 0:34 | não |
| `human_peace_5` | Jardins do Castelo | 96 bpm · 3/4 · Sol maior · 0:30 | não |
| `human_peace_6` | Cavaleiros ao Amanhecer | 96 bpm · 6/8 · Fá maior · 0:30 | não |
| `human_peace_7` | Juramento da Guarda | 84 bpm · 4/4 · Mi♭ maior · 0:46 | não |

### Reino / combate — `human_combat` (3 atuais + 6 candidatas)

| id | título | andamento · compasso · modo · volta | No jogo (padrão) |
|---|---|---|---|
| `human_combat_0` | Clarim de Guerra | 132 bpm · 4/4 · Mi dórico · 0:15 | não (atual) |
| `human_combat_1` | Carga da Guarda | 136 bpm · 4/4 · Sol maior · 0:14 | não (atual) |
| `human_combat_2` | Aço e Estandarte | 140 bpm · 4/4 · Ré dórico · 0:14 | não (atual) |
| `human_combat_3` | Marcha de Ataque Pesada | 108 bpm · 4/4 · Ré menor · 0:36 | não |
| `human_combat_4` | Perseguição em 6/8 | 126 bpm · 6/8 · Lá menor · 0:23 | não |
| `human_combat_5` | Cerco Lento | 72 bpm · 4/4 · Si menor · 0:53 | não |
| `human_combat_6` | Carga da Cavalaria | 144 bpm · 4/4 · Sol mixolídio · 0:27 | não |
| `human_combat_7` | Defesa Desesperada | 120 bpm · 4/4 · Mi menor harmônico · 0:32 | não |
| `human_combat_8` | Confronto Sombrio | 80 bpm · 4/4 · Sol menor harmônico · 0:48 | não |

### Horda / paz — `orc_peace` (3 atuais + 5 candidatas)

| id | título | andamento · compasso · modo · volta | No jogo (padrão) |
|---|---|---|---|
| `orc_peace_0` | Brasas nas Montanhas | 120 bpm · 4/4 · Ré frígio · 0:16 | sim |
| `orc_peace_1` | Tambores Distantes | 122 bpm · 4/4 · Mi frígio · 0:16 | sim |
| `orc_peace_2` | Noite do Clã | 124 bpm · 4/4 · Lá frígio · 0:15 | sim |
| `orc_peace_3` | Fogueira dos Clãs | 92 bpm · 5/4 · Mi frígio · 0:39 | não |
| `orc_peace_4` | Marcha das Trompas | 100 bpm · 7/8 · Lá frígio · 0:34 | não |
| `orc_peace_5` | Canto da Planície | 84 bpm · 4/4 · Ré menor · 0:46 | não |
| `orc_peace_6` | Forja do Clã | 96 bpm · 4/4 · Lá frígio · 0:40 | não |
| `orc_peace_7` | Pedra e Fumaça | 80 bpm · 6/8 · Sol menor harmônico · 0:36 | não |

### Horda / combate — `orc_combat` (3 atuais + 6 candidatas)

| id | título | andamento · compasso · modo · volta | No jogo (padrão) |
|---|---|---|---|
| `orc_combat_0` | Trovão de Guerra | 136 bpm · 4/4 · Ré frígio · 0:14 | não (atual) |
| `orc_combat_1` | Galope do Clã | 138 bpm · 4/4 · Mi frígio · 0:14 | não (atual) |
| `orc_combat_2` | Ruína e Cinza | 140 bpm · 4/4 · Lá frígio · 0:14 | não (atual) |
| `orc_combat_3` | Invasão Implacável | 112 bpm · 4/4 · Mi frígio · 0:34 | não |
| `orc_combat_4` | Perseguição Selvagem | 132 bpm · 6/8 · Ré frígio · 0:22 | não |
| `orc_combat_5` | Cerco da Horda | 66 bpm · 4/4 · Dó frígio · 0:58 | não |
| `orc_combat_6` | Carga dos Lobos | 150 bpm · 7/8 · Si frígio · 0:22 | não |
| `orc_combat_7` | Defesa do Clã | 126 bpm · 5/4 · Fá menor harmônico · 0:38 | não |
| `orc_combat_8` | Coro da Escuridão | 90 bpm · 4/4 · Dó# menor · 0:43 | não |

### Vitória e derrota (efeitos curtos de `sfxRecipes.js`)

| id | receita | observação |
|---|---|---|
| `victory_human` | `victoryFanfareHuman` | já existia (tela final da campanha) |
| `victory_orc` | `victoryFanfareOrc` | já existia |
| `defeat_human` | `defeatHuman` | nova: trompete que desce e se apaga em lá menor |
| `defeat_orc` | `defeatOrc` | nova: trítono descendente, bordão que cai e golpe de tambor |

(`bpm` do catálogo é de **semínima**; `6/8` = 12 passos de semicolcheia por compasso, `7/8` = 14, `5/4` = 20, `3/4` = 12.)

## 4. Evolução no tempo (faixas de paz)

`intensityFromGameTime(gameTime)` (em `intensity.js`) vira uma intensidade **0..1**: 0 até 2 min de partida, suavizada
(smoothstep) até 1 aos 20 min. `MatchSession.update` entrega o `gameTime` a `SoundManager.setMatchTime`, que chama
`MusicPlayer.setIntensity` (quantizada em 1/16). Efeito, sem quebrar o laço (a posição é sempre `passo % tamanho do laço`):

- **camadas** com `int: x` só soam a partir de `x` (caixa marchando, tímpanos, cordas em tremolo, metais em quintas/trítono,
  bumbo, prato; na Horda taiko extra, coro e galope) — a densidade **só cresce** (testado);
- **registro**: a melodia principal sobe uma oitava a partir de 0,75 (`lift`);
- **andamento**: `tempoGain` (+2 … +6 %, padrão 4 %) em intensidade 1.

O inspetor tem o controle "Evolução no tempo" para ouvir isso (mostra os minutos de partida equivalentes). O tema de abertura
e o combate não aceleram.

## 5. Abertura nos menus

Sem partida, o `AudioEngine` toca a família `title` (faixa habilitada; padrão `title_0`) depois do **primeiro gesto** do usuário
(`main.js` cria o `SoundManager` já no menu principal; o `AudioContext` continua nascendo só no gesto). Ao iniciar a partida
há crossfade (2,5 s) para a música da facção; ao voltar ao menu (`endMatch`) o tema retorna. Respeita `?audio=0` (nenhum
contexto é criado), o volume de música das Opções e a preferência "música desligada".

## 6. Orçamento de CPU

O `MusicPlayer` gera a música **de forma incremental**: um passo (semicolcheia) por vez, só dentro da janela de 1 s à frente;
cada `tick` (150 ms) agenda no máximo 80 notas e 24 passos. Cada passo gera ≤ 16 notas nas faixas novas (testado também com
intensidade 1; as 3 clássicas de paz chegam a 17 com a evolução ligada) e cada nota cria ~4–6 nós de áudio; nada é
pré-renderizado nem decodificado. As linhas escritas são indexadas uma vez por camada (`WeakMap`). Os testes de player cobrem
todas as faixas do catálogo.

## 7. Como escrever uma faixa nova

`makeTrack({ family, faction, state, variant, bpm, meter, mode, key, deg, layers })`, em `tracksHuman.js`/`tracksOrc.js`:
`deg` são os graus dos acordes por compasso (`'4M'` força a qualidade: `M m d a s s2 p`), e as camadas usam os construtores de
`trackKit.js`. Melodias são **escritas** com `LN(inst, oitava, vel, 'grau:duração …')` (grau 0 = tônica; 7 = oitava; `r:` pausa;
`0,2,4:8` acorde; duração em passos). Depois: registre a faixa em `musicScores.js`, adicione a entrada em `INFO` (`catalog.js`,
título e descrição em PT-BR) — os testes (`musicTracksNew.test.js`) conferem escala, compasso, duração, tempos fortes em tons do
acorde, saltos, orçamento de notas e que a faixa toca no `MusicPlayer`.

## 8. Verificação

### 8.1 Automática: `tools/audio-check.mjs` (M1-02, passou em 2026-10-17)
`bash tools/safe-run.sh --timeout 400 -- node tools/audio-check.mjs` (Chromium com GPU real, `--mute-audio`, vite próprio na porta 5247).
Não ouve nada: confere contadores, logs e renderização OFFLINE (`OfflineAudioContext`). Cobre: automação muda por padrão; o
`AudioContext` só nasce no primeiro clique (`?audio=med` e navegador comum); clique de seleção/ordem; batalha (efeitos,
teto de vozes, música paz → combate da facção); cena visível (com a câmera longe nenhum efeito posicional chega ao motor, os
que chegam estão no frustum); volumes por canal e persistência; tileset × facção (música e ambiência); e, offline, pico/RMS de
música (**todas** as 37 faixas do catálogo no volume máximo), ambiência, as 39 variantes de receita de efeito e pisos de pior
caso (golpes a cada 30 ms; 25 efeitos no mesmo instante). Critério central: nada passa de 1,0 (o `DynamicsCompressor` do mestre
é seguido de um saturador suave, `SOFT_CLIP` em `src/audio/audioConfig.js`, que garante o teto também para vozes que começam
juntas). Falha com `pageerror`/`console.error`. Resultado: 31 verificações OK, 0 falhas; maior pico de música 0,959; 25
efeitos simultâneos no máximo = pico 1,0 sem nenhuma amostra acima. As falas foram removidas do jogo, então a verificação
de fala/ducking da versão original da branch `task/F7-08-verificacao` não existe mais.

### 8.2 Pendente: parte auditiva (G1, local, com som)

- `/inspector.html` → **Músicas**: ouvir cada faixa e marcar as que ficam; testar "Ouvir transição paz → combate",
  "Só ouvir os marcados" e "Copiar seleção (JSON)".
- Menu principal (e Escaramuça, Campanha, Opções): o tema de abertura toca depois do primeiro clique; ao iniciar a partida
  troca com fade para a música da facção; ao voltar ao menu o tema retorna.
- Regravar a baseline visual do inspetor (F10-03): o cabeçalho ganhou o botão "🎵 Músicas".
