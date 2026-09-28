# 06 — Roadmap: WarPoly → melhor RTS de navegador

## Visão

"**Warcraft II reimaginado em 3D low-poly, rodando a 60 FPS em qualquer navegador, com campanha, skirmish contra IA com dificuldades e multiplayer web por link.**"

Pilares:
1. **Fluidez**: 60 FPS com 300+ unidades em GPU integrada; carregamento < 5 s.
2. **Paridade WC2**: todos os recursos de jogo listados em [05_PARIDADE_WARCRAFT2.md](05_PARIDADE_WARCRAFT2.md).
3. **Controles de RTS competitivo**: grupos, filas de ordens, atalhos, attack-move.
4. **IA crível** em 4 dificuldades, respeitando a névoa.
5. **Polimento AAA**: HUD responsiva, VFX, áudio posicional, menus completos, i18n.
6. **Multiplayer** lockstep P2P (WebRTC) até 8 jogadores + replays.

## Fases (cada fase = marco jogável)

| Fase | Nome | Objetivo mensurável | Depende de |
|---|---|---|---|
| **F0** | Fundação | Backup, docs, repo limpo, lint/test/bench, dados de balanceamento centralizados | — |
| **F1** | Desempenho | ≥ 60 FPS na cena inicial e ≥ 45 FPS com 200 unidades; load < 8 s | F0-04 (bench) |
| **F2** | Núcleo do motor | N jogadores, IDs, sistema de comandos, timestep fixo, RNG determinístico, estados de jogo (menu→partida→pós), mapas por dados, save/load | F0-06 |
| **F3** | Jogabilidade WC2 — base | Controles completos, combate com tipos de dano, economia WC2 (minas, florestas, comida), reparo, muralhas, tiers de HQ, árvore tecnológica | F2 (C1,C2) |
| **F4** | Jogabilidade WC2 — expansão | Cavalaria, cerco, conjuradores + mana/magias, sapadores, aéreo, naval + petróleo, neutros | F3 |
| **F5** | IA | Refatorada para N jogadores e comandos; 4 dificuldades; build orders; micro; scout; FFA | F2, cresce junto com F3/F4 |
| **F6** | HUD/UX | Menu principal, setup de partida (facção/mapa/dificuldade/cor), HUD responsiva estilo WC2, opções gráficas, atalhos configuráveis, pós-jogo, tutorial, i18n | F2-04 |
| **F7** | Arte e áudio | Paridade de fidelidade orc, team color, pós-processamento, terreno com biomas (4 tilesets), VFX, animações com blend, áudio posicional e falas | F1 (pipeline de merge/texturas) |
| **F8** | Conteúdo | 6+ mapas skirmish, gerador procedural, editor de mapas, 2 campanhas (8+ missões cada), sistema de scripts/gatilhos | F2-05, F3 |
| **F9** | Multiplayer | Lobby + sinalização, lockstep WebRTC, checksum anti-desync, reconexão, chat, replays | F2 (C1–C3, P10) |
| **F10** | Qualidade e lançamento | Testes, soak IA×IA, regressão visual, orçamento de perf em CI, PWA, deploy | contínuo |

## Ordem recomendada (caminho crítico)

```
F0 ──► F1 (perf) ─────────────────────────────► F7 (arte)
  └──► F2 (núcleo) ──► F3 ──► F4 ──► F8 (conteúdo/campanha)
             │          └──► F5 (IA acompanha F3/F4)
             ├──► F6 (menus/HUD)
             └──► F9 (multiplayer)
F10 roda em paralelo a tudo
```

F1 e F2 podem andar em paralelo porque tocam arquivos diferentes (F1: `models/`, `SceneManager`, `FogOfWar`, `Pathfinder`; F2: `GameManager`, `Unit`, `Building`, novo `src/sim/`). Veja a matriz de posse de arquivos no [TASKS.md](TASKS.md).

## Decisões de arquitetura já recomendadas

1. **Simulação separada da renderização**: `src/sim/` (estado puro, sem three.js, timestep fixo 20 Hz) + `src/render/` (lê o estado e interpola). Pré-requisito para lockstep, replays, IA headless e testes.
2. **Dados declarativos** em `src/data/` (unidades, construções, pesquisas, magias, facções, mapas) — uma única fonte de verdade.
3. **Comandos serializáveis** (`{tick, playerId, type, unitIds, target}`) como única forma de alterar o estado.
4. **Multiplayer = lockstep determinístico P2P** (WebRTC DataChannel) com servidor de sinalização mínimo; sem servidor autoritativo (custo zero de infraestrutura, adequado a RTS).
5. **Assets via Blender headless** (disponível em `/home/rafael/Downloads/blender-5.2.1-linux-x64/blender`, 5.2.1 LTS): modelos gerados por scripts Python versionados em `tools/blender/`, com bake de texturas em atlas 512², malhas unidas por material, esqueleto + animações e export `.glb` para `public/models/`. O mesmo pipeline renderiza ícones e retratos da HUD. Os modelos procedurais atuais ficam como fallback até cada um ser migrado (tarefas F7-00/F7-00b/F7-09). Onde o Blender não for usado, continua valendo o "bake" em runtime (F1-01/F1-02/F1-03).
6. **Linguagem**: migrar gradualmente para TypeScript via JSDoc + `checkJs` (sem reescrita).
