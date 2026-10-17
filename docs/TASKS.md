A execução atual está em [PLANO_FINAL.md](PLANO_FINAL.md) (fichas em [PLANO_FINAL_TAREFAS.md](PLANO_FINAL_TAREFAS.md)).

# TASKS — registro de tarefas

> Este arquivo é o **índice** das tarefas antigas (F0–F10, backlog NEW, novo mundo). O texto integral (Fazer, Aceite, Resultado, notas de integração) está em [historico/TASKS_ate_2026-10-17.md](historico/TASKS_ate_2026-10-17.md); a pesquisa de nuvem, auditoria e handoffs antigos estão em [historico/](historico/). Tarefas novas **não** entram aqui: vivem no quadro da §6 do `PLANO_FINAL.md`.

## Protocolo (resumo)

- Regras de execução: [PLANO_FINAL.md §2](PLANO_FINAL.md#2-regras-de-execução-curtas). Uma tarefa = uma branch `task/<ID>` = uma ficha em `PLANO_FINAL_TAREFAS.md`; o coordenador atualiza o quadro depois do merge `--no-ff` em `master`.
- Status: `TODO` → `DOING` → `REVIEW` → `DONE` (também `BLOCKED`, `DROPPED`, `PARCIAL`). Antes de começar leia `CLAUDE.md`, `docs/specs/_COMUM.md` e a ficha.
- Processos pesados (navegador, Blender, bench, smoke) só por `tools/safe-run.sh`; verificação mínima: `npm test && npm run lint && npx vite build --outDir /tmp/claude-1000/warpoly-build-check`.

## Lanes (posse de arquivos)

| Lane | Escopo |
|---|---|
| FOUND | raiz, configs, `docs/`, `tools/` |
| PERF | `src/models/**`, `ModelFactory`, `SceneManager`, `FogOfWar`, `Pathfinder`, `world/**`, `src/render/**` |
| CORE | `GameManager`, `Unit`, `Building`, `main.js`, `src/sim/**` |
| GAME | `InputManager`, `src/sim/systems/**`, `src/data/**` (unidades e construções) |
| AI | `src/ai/**` |
| UI | `index.html`, `style.css`, `src/ui/**` |
| ART | `src/models/**` (modelos novos), `src/inspector/**`, `tools/blender/**` |
| AUDIO | `SoundManager`, `src/audio/**` |
| CONTENT | `src/data/maps/**`, `src/data/campaigns/**`, editor de mapas |
| NET | `src/net/**`, `server/**` |
| QA | `tests/**`, `tools/bench/**`, CI |

> PERF e ART compartilham `src/models/**`: não rodar as duas lanes no mesmo arquivo de modelo ao mesmo tempo.

## Tarefas antigas (uma entrada por tarefa; status final em 2026-10-17)

**F0 Fundação**
- [F0-01](historico/TASKS_ate_2026-10-17.md#f0-01--backup-completo-do-projeto) Backup completo do projeto — DONE · [F0-02](historico/TASKS_ate_2026-10-17.md#f0-02--documentação-de-conhecimento--plano) Documentação de conhecimento + plano — DONE
- [F0-03](historico/TASKS_ate_2026-10-17.md#f0-03--limpeza-do-repositório) Limpeza do repositório — DONE · [F0-04](historico/TASKS_ate_2026-10-17.md#f0-04--harness-de-benchmark-de-desempenho) Harness de benchmark de desempenho — DONE
- [F0-05](historico/TASKS_ate_2026-10-17.md#f0-05--ferramentas-de-qualidade) Ferramentas de qualidade — DONE · [F0-06](historico/TASKS_ate_2026-10-17.md#f0-06--centralizar-dados-de-balanceamento) Centralizar dados de balanceamento — DONE
- [F0-07](historico/TASKS_ate_2026-10-17.md#f0-07--registrar-decisões-de-produto-pendentes) Registrar decisões de produto pendentes — DONE

**F1 Desempenho**
- [F1-01](historico/TASKS_ate_2026-10-17.md#f1-01--texturas-procedurais-resolução-e-empacotamento) Texturas procedurais: resolução e empacotamento — DONE · [F1-02](historico/TASKS_ate_2026-10-17.md#f1-02--mesclar-geometrias-dos-templates-estáticos) Mesclar geometrias dos templates estáticos — DONE
- [F1-03](historico/TASKS_ate_2026-10-17.md#f1-03--unidades-mesclar-partes-rígidas-por-osso) Unidades: mesclar partes rígidas por "osso" — DONE · [F1-04](historico/TASKS_ate_2026-10-17.md#f1-04--sombras-e-renderer) Sombras e renderer — DONE
- [F1-05](historico/TASKS_ate_2026-10-17.md#f1-05--névoa-de-guerra-via-shader-corrige-b1-b2) Névoa de guerra via shader (corrige B1, B2) — DONE · [F1-06](historico/TASKS_ate_2026-10-17.md#f1-06--grade-espacial-spatial-hash-para-a-simulação) Grade espacial (spatial hash) para a simulação — DONE
- [F1-07](historico/TASKS_ate_2026-10-17.md#f1-07--pathfinder-de-produção) Pathfinder de produção — DONE · [F1-08](historico/TASKS_ate_2026-10-17.md#f1-08--eliminar-alocações-e-vazamentos) Eliminar alocações e vazamentos — DONE
- [F1-09](historico/TASKS_ate_2026-10-17.md#f1-09--timestep-fixo-e-interpolação) Timestep fixo e interpolação — DONE · [F1-10](historico/TASKS_ate_2026-10-17.md#f1-10--lod-e-culling) LOD e culling — DOING (parcial)

**F2 Núcleo do motor**
- [F2-01](historico/TASKS_ate_2026-10-17.md#f2-01--modelo-de-jogadores-e-ids-de-entidade) Modelo de jogadores e IDs de entidade — DONE · [F2-02](historico/TASKS_ate_2026-10-17.md#f2-02--sistema-de-comandos) Sistema de comandos — DONE
- [F2-03](historico/TASKS_ate_2026-10-17.md#f2-03--determinismo) Determinismo — DONE · [F2-04](historico/TASKS_ate_2026-10-17.md#f2-04--máquina-de-estados-do-jogo) Máquina de estados do jogo — DONE
- [F2-05](historico/TASKS_ate_2026-10-17.md#f2-05--mapas-orientados-a-dados) Mapas orientados a dados — DONE · [F2-06](historico/TASKS_ate_2026-10-17.md#f2-06--save--load) Save / Load — DONE
- [F2-07](historico/TASKS_ate_2026-10-17.md#f2-07--barramento-de-eventos-e-desacoplamento) Barramento de eventos e desacoplamento — DONE · [F2-08](historico/TASKS_ate_2026-10-17.md#f2-08--separação-simrender) Separação sim/render — DONE

**F3 Jogabilidade base**
- [F3-00](historico/TASKS_ate_2026-10-17.md#f3-00--documento-de-design-de-paridade-tabelas-finais) Documento de design de paridade (tabelas finais) — DONE · [F3-01](historico/TASKS_ate_2026-10-17.md#f3-01--controles-rts-completos) Controles RTS completos — DONE
- [F3-02](historico/TASKS_ate_2026-10-17.md#f3-02--movimento-em-grupo-e-formações) Movimento em grupo e formações — DONE · [F3-03](historico/TASKS_ate_2026-10-17.md#f3-03--modelo-de-combate) Modelo de combate — DONE
- [F3-04](historico/TASKS_ate_2026-10-17.md#f3-04--economia-wc2) Economia WC2 — DONE · [F3-05](historico/TASKS_ate_2026-10-17.md#f3-05--reparo-e-cancelamento-de-construção) Reparo e cancelamento de construção — DONE
- [F3-06](historico/TASKS_ate_2026-10-17.md#f3-06--tiers-de-hq-e-árvore-tecnológica) Tiers de HQ e árvore tecnológica — DONE · [F3-07](historico/TASKS_ate_2026-10-17.md#f3-07--pesquisas-em-níveis) Pesquisas em níveis — DONE
- [F3-08](historico/TASKS_ate_2026-10-17.md#f3-08--muralhas) Muralhas — DONE · [F3-09](historico/TASKS_ate_2026-10-17.md#f3-09--condições-de-vitória-e-estatísticas) Condições de vitória e estatísticas — DONE
- [F3-10](historico/TASKS_ate_2026-10-17.md#f3-10--neutros-e-critters) Neutros e critters — DONE · [F3-11](historico/TASKS_ate_2026-10-17.md#f3-11--revisão-de-balanceamento-base) Revisão de balanceamento base — DONE

**F4 Expansão**
- [F4-01](historico/TASKS_ate_2026-10-17.md#f4-01--cavalaria-estábulo--covil-de-ogros) Cavalaria (Estábulo / Covil de Ogros) — DONE · [F4-02](historico/TASKS_ate_2026-10-17.md#f4-02--unidades-de-cerco-balista--catapulta) Unidades de cerco (Balista / Catapulta) — DONE
- [F4-03](historico/TASKS_ate_2026-10-17.md#f4-03--sistema-de-mana-e-habilidades) Sistema de mana e habilidades — DONE · [F4-04](historico/TASKS_ate_2026-10-17.md#f4-04--conjuradores-e-magias) Conjuradores e magias — DONE
- [F4-04b](historico/TASKS_ate_2026-10-17.md#f4-04b--temploaltar-templário-e-ogro-feiticeiro-magias-restantes) Templo/Altar, Templário e Ogro Feiticeiro, magias restantes — DONE · [F4-05](historico/TASKS_ate_2026-10-17.md#f4-05--sapadores) Sapadores — DONE
- [F4-06](historico/TASKS_ate_2026-10-17.md#f4-06--unidades-aéreas) Unidades aéreas — DONE · [F4-07](historico/TASKS_ate_2026-10-17.md#f4-07--naval--petróleo) Naval + Petróleo — DONE
- [F4-08](historico/TASKS_ate_2026-10-17.md#f4-08--heróis-de-campanha) Heróis de campanha — DONE

**F5 IA**
- [F5-01](historico/TASKS_ate_2026-10-17.md#f5-01--refatorar-ia-para-jogadores--comandos) Refatorar IA para jogadores + comandos — DONE · [F5-02](historico/TASKS_ate_2026-10-17.md#f5-02--percepção-sob-a-névoa) Percepção sob a névoa — DONE
- [F5-03](historico/TASKS_ate_2026-10-17.md#f5-03--níveis-de-dificuldade) Níveis de dificuldade — DOING (adiada pelo dono) · [F5-04](historico/TASKS_ate_2026-10-17.md#f5-04--estratégias-e-build-orders) Estratégias e build orders — DONE
- [F5-05](historico/TASKS_ate_2026-10-17.md#f5-05--micro-tático) Micro tático — DONE · [F5-06](historico/TASKS_ate_2026-10-17.md#f5-06--ia-de-campanhagatilhos) IA de campanha/gatilhos — DONE

**F6 HUD/UX**
- [F6-01](historico/TASKS_ate_2026-10-17.md#f6-01--menu-principal) Menu principal — DONE · [F6-02](historico/TASKS_ate_2026-10-17.md#f6-02--tela-de-configuração-de-partida-skirmish) Tela de configuração de partida (Skirmish) — DONE
- [F6-03](historico/TASKS_ate_2026-10-17.md#f6-03--hud-responsiva-estilo-wc2-corrige-b11) HUD responsiva estilo WC2 (corrige B11) — DONE · [F6-04](historico/TASKS_ate_2026-10-17.md#f6-04--minimapa-de-produção) Minimapa de produção — DONE
- [F6-05](historico/TASKS_ate_2026-10-17.md#f6-05--alertas-e-feedback) Alertas e feedback — DONE · [F6-06](historico/TASKS_ate_2026-10-17.md#f6-06--cursores-contextuais-e-destaque) Cursores contextuais e destaque — DONE
- [F6-07](historico/TASKS_ate_2026-10-17.md#f6-07--tela-pós-jogo) Tela pós-jogo — DONE · [F6-08](historico/TASKS_ate_2026-10-17.md#f6-08--opções-completas) Opções completas — DONE
- [F6-09](historico/TASKS_ate_2026-10-17.md#f6-09--internacionalização--tutorial-corrige-b12) Internacionalização + tutorial (corrige B12) — DONE

**F7 Arte e áudio**
- [F7-00](historico/TASKS_ate_2026-10-17.md#f7-00--pipeline-de-arte-com-blender-headless--poc) Pipeline de arte com Blender (headless) — PoC — DONE · [F7-00b](historico/TASKS_ate_2026-10-17.md#f7-00b--migração-de-todo-o-catálogo-para-o-pipeline-blender) Migração de todo o catálogo para o pipeline Blender — REVIEW
- [F7-09](historico/TASKS_ate_2026-10-17.md#f7-09--ícones-retratos-e-artes-2d-renderizados-no-blender) Ícones, retratos e artes 2D renderizados no Blender — REVIEW · [F7-01](historico/TASKS_ate_2026-10-17.md#f7-01--paridade-de-fidelidade-das-unidades-orcs) Paridade de fidelidade das unidades orcs — TODO
- [F7-02](historico/TASKS_ate_2026-10-17.md#f7-02--cores-de-time) Cores de time — REVIEW · [F7-03](historico/TASKS_ate_2026-10-17.md#f7-03--iluminação-e-pós-processamento) Iluminação e pós-processamento — DONE
- [F7-04](historico/TASKS_ate_2026-10-17.md#f7-04--terreno-e-tilesets) Terreno e tilesets — DONE · [F7-05](historico/TASKS_ate_2026-10-17.md#f7-05--vfx) VFX — DONE
- [F7-06](historico/TASKS_ate_2026-10-17.md#f7-06--animação-de-produção) Animação de produção — DONE · [F7-07](historico/TASKS_ate_2026-10-17.md#f7-07--modelos-novos-para-f3f4) Modelos novos (para F3/F4) — TODO
- [F7-08](historico/TASKS_ate_2026-10-17.md#f7-08--áudio-de-produção) Áudio de produção — REVIEW

**F8 Conteúdo**
- [F8-01](historico/TASKS_ate_2026-10-17.md#f8-01--pacote-de-mapas-skirmish) Pacote de mapas skirmish — DONE · [F8-02](historico/TASKS_ate_2026-10-17.md#f8-02--gerador-procedural-de-mapas) Gerador procedural de mapas — DONE
- [F8-03](historico/TASKS_ate_2026-10-17.md#f8-03--editor-de-mapas-no-navegador) Editor de mapas no navegador — REVIEW · [F8-04](historico/TASKS_ate_2026-10-17.md#f8-04--sistema-de-missões-e-gatilhos) Sistema de missões e gatilhos — DONE
- [F8-05](historico/TASKS_ate_2026-10-17.md#f8-05--campanha-da-aliança-8-missões) Campanha da Aliança (8+ missões) — REVIEW · [F8-06](historico/TASKS_ate_2026-10-17.md#f8-06--campanha-da-horda-8-missões) Campanha da Horda (8+ missões) — TODO

**F9 Multiplayer**
- [F9-01](historico/TASKS_ate_2026-10-17.md#f9-01--arquitetura-e-prova-de-conceito) Arquitetura e prova de conceito — DONE · [F9-02](historico/TASKS_ate_2026-10-17.md#f9-02--servidor-de-sinalização--lobby) Servidor de sinalização + lobby — DONE
- [F9-03](historico/TASKS_ate_2026-10-17.md#f9-03--lockstep-webrtc) Lockstep WebRTC — REVIEW · [F9-04](historico/TASKS_ate_2026-10-17.md#f9-04--robustez) Robustez — DONE
- [F9-05](historico/TASKS_ate_2026-10-17.md#f9-05--replays) Replays — REVIEW

**F10 Qualidade e lançamento**
- [F10-01](historico/TASKS_ate_2026-10-17.md#f10-01--testes-da-simulação) Testes da simulação — DONE · [F10-02](historico/TASKS_ate_2026-10-17.md#f10-02--soak-test-iaia-headless) Soak test IA×IA headless — DONE
- [F10-03](historico/TASKS_ate_2026-10-17.md#f10-03--regressão-visual) Regressão visual — DONE · [F10-04](historico/TASKS_ate_2026-10-17.md#f10-04--orçamento-de-desempenho-em-ci) Orçamento de desempenho em CI — REVIEW
- [F10-05](historico/TASKS_ate_2026-10-17.md#f10-05--empacotamento-e-deploy) Empacotamento e deploy — REVIEW

**Backlog descoberto (NEW, correções, soak) e novo mundo (MUNDO, ART, música)**
- [NEW-1](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Remover GLTFBuildingLoader — DONE · [NEW-2](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) IA reembolsava custo errado — DONE
- [NEW-3](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Nomes PT-BR no card de seleção — DONE · [NEW-4](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Pathfinder: pontos idênticos — DONE
- [NEW-5](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Materiais/texturas não usados — DONE · [NEW-6](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) ORM de texturas (High < 300 MB) — TODO
- [NEW-7](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) TreeManager: instâncias e culling — REVIEW · [NEW-8](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Rosto dos orcs só na face +Z — DONE
- [NEW-9](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Agressividade inicial da IA — TODO · [NEW-10](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Golpe termina à frente (+Z) — DONE
- [NEW-11](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Avisos de depreciação three 0.186 — DONE · [NEW-12 / F7-00c](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Modelos .glb por padrão — DONE
- [F0-08](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Navegador sem GPU real aborta — DONE · [NEW-13](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Névoa: chamas e borda do mapa — REVIEW
- [NEW-14](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) CPU de animação por unidade — TODO · [NEW-15](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Meta 50 FPS em combate100 — TODO
- [F1-03b](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Unidades SkinnedMesh rígido — DONE · [BUGS-01](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Pacote de correções pequenas (nuvem) — DONE
- [NEW-16](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) HUD < 1100 px: população atual/máx. — DONE · [NEW-17](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Textura do terreno por altura — DONE
- [NEW-18](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Guia rápido sem seleção — DONE · [NEW-19](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Ruínas ao destruir construção/mina — REVIEW
- [NEW-20](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Teste intermitente (adiada) — ADIADA · [NEW-21](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) A* sem caminho vai ao ponto mais próximo — DONE
- [NEW-22](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Textos em inglês do card traduzidos — DONE · [NEW-23](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Projétil balístico com mira preditiva — DONE
- [NEW-24](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Muralha: portão e conexões — REVIEW · [NEW-25](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) IA ataca acampamentos neutros — REVIEW
- [NEW-26](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Card de unidade neutra — REVIEW · [NEW-27](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Draw calls dos neutros — TODO
- [NEW-28](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Reparo/cancelar obra no jogo — DONE · [NEW-29](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Nomes das construções (D7) — DONE
- [NEW-30](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Repetir lote de balanceamento — TODO · [NEW-31](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) check-data-parity sem exceção — DONE
- [NEW-32](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Refino de Camponês, Lacaio, troll… — DONE · [NEW-33](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Arte do Cavaleiro, Estábulo, Covil — DONE
- [NEW-34](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Escolta de cerco pela IA — REVIEW · [NEW-35](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Ataque no chão do cerco — REVIEW
- [NEW-36](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Arte: Balista, Catapulta, Oficinas — DONE · [NEW-37](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Refazer Espadachim e Cavaleiro — DONE
- [NEW-38](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Verificar 12 magias no jogo — DONE · [NEW-39](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Arte: Mago, Necromante, Torre Arcana — DONE
- [NEW-40](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Arte: Templo, Altar, Olho Vigia… — DONE · [NEW-41](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) MinHeap do pathfinder (Float32) — DONE
- [NEW-42](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Soak: partida sem fim (seed 10) — DONE · [NEW-43](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Soak: janela parada (ilhas-4p, seed 15) — DONE
- [NEW-44](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) IA sem madeira disponível — REVIEW · [NEW-45](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Soak: estreito-1v1 parado (seed 5) — DONE
- [NEW-46](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Soak 100 partidas: 4 sem fim — DONE · [NEW-47](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Soak: janelas > 2400 ticks paradas — DONE
- [NEW-48](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Soak: partidas > 40000 ticks — DONE · [NEW-49](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Machado do Arremessador salta — REVIEW
- [NEW-50](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Aviso de erro do lobby não limpa — DONE · [NEW-51](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Soak: confirmar seed 82 — TODO
- [NEW-52](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Juncos em posições do mapa antigo — REVIEW · [NEW-53](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Forte Atalaia da m04 e retorno do dono — DONE
- [NEW-54](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Mina/pedreira esgotada desaba — DONE · [NEW-55](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Soak de ilhas-4p não termina (seeds 1 e 6) — TODO
- [NEW-56](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) P-14: serraria perto de bosque — TODO · [NEW-57](historico/TASKS_ate_2026-10-17.md#backlog-descoberto) Textura do terreno espelhada em z — DONE
- [MUNDO-1](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Terreno: lava e costa irregular — PARCIAL · [MUNDO-2](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Seis heróis (dados e habilidades) — DONE
- [MUNDO-3](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Seletor de campanhas main × beta — DONE · [MUNDO-4](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Tela de abertura da história — DONE
- [MUNDO-5](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Biomas e tilesets novos — PARCIAL · [MUNDO-6](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) 24 missões JSON (registro) — PARCIAL
- [MUNDO-7](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Mapas por tipo (6 registrados) — PARCIAL · [MUNDO-8](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Fauna: javali e ovelha (dados) — DONE
- [MUNDO-9](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Mapa-múndi ilustrativo — PARCIAL · [MUNDO-10](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Migração e docs do novo mundo — PARCIAL
- [ART-01..04](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) P0 de arte: props, árvores, javali — PARCIAL · [ART-05..16](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Arte de terreno e modelos dos heróis — TODO
- [MUSICA](historico/TASKS_ate_2026-10-17.md#novo-mundo-2026-10-11-a-2026-10-13) Catálogo de 41 faixas e player — REVIEW

Status nesta tabela = o último registrado no histórico (corte 2026-10-17). O estado real e o que falta para o 1.0 estão em [PLANO_FINAL.md §6](PLANO_FINAL.md#6-quadro-de-tarefas-ordem-de-execução-status-atualizado-por-mim).
