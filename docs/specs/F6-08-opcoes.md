# F6-08 · Menu de Opções completo

Leia antes: `docs/specs/_COMUM.md` (na nuvem: `docs/HANDOFF_CLOUD.md`), `CLAUDE.md`, `docs/07_DECISOES.md` (D3 hardware), `src/core/QualitySettings.js` (API: `QualitySettings.current`, `set(preset)` → `{requiresReload}`, `QUALITY_PRESETS`), `src/models/textureQuality.js` (`localStorage['warpoly.textureQuality']`), `src/ui/uiScale.js` (`localStorage['warpoly.uiScale']`), `src/ui/screens/MainMenu.js` (painel placeholder `#mm-options` ~linha 234) e o painel de config in-game (`#settings-panel` em `index.html`).

## "Pronto"
Um único componente de Opções, aberto pelo menu principal **e** pelo menu de pausa/engrenagem in-game, com abas, que persiste tudo em `localStorage` e aplica imediatamente o que não exige recarregar.

## Implementação
Crie `src/ui/screens/OptionsPanel.js` + `optionsPanel.css` (identidade visual do `mainMenu.css`). Abas:
1. **Gráficos**: preset (Baixo/Médio/Alto/Ultra) via `QualitySettings.set`; avançado: qualidade de textura (low/med/high/ultra → `warpoly.textureQuality`, exige recarregar), sombras on/off, resolução dinâmica on/off, FPS alvo (30/60/120/sem limite), escala de resolução máx. (0,5–2,0). Mostrar aviso "Aplica ao reiniciar a partida" quando `requiresReload`. Nomes/valores do avançado: leia `QUALITY_PRESETS` e, se `QualitySettings` não expuser setters individuais, adicione `QualitySettings.setOverride(key, value)` persistido em `localStorage['warpoly.qualityOverrides']` (JSON) e aplicado sobre o preset — mudança pequena e isolada em `QualitySettings.js`.
2. **Áudio**: volume geral, efeitos, música (usa `SoundManager.setSfxVolume/setMusicVolume`; geral multiplica os dois). Persistir.
3. **Controles**: tabela das teclas (leia de `src/ui/hotkeys.js` e da lista da F3-01 se já existir `src/core/Hotkeys.js`; senão mostre só as do card); remapeamento **não** nesta tarefa (mostrar "em breve"); velocidade de rolagem da câmera (0,5–2×, `localStorage['warpoly.panSpeed']` — ler em `InputManager` apenas se a nuvem não estiver impedida; se `InputManager` for tocado por F3-01 em paralelo, deixe a leitura para depois e registre); pan pela borda on/off (`warpoly.edgePan`).
4. **Interface**: escala da UI (0,75–1,5 → `warpoly.uiScale` + chamar o recálculo do `uiScale.js`), modo daltônico para cores de time (salvar `warpoly.colorblind`: off/protan/deutan/tritan — a aplicação nas cores fica para F7-02; só salvar).
5. **Jogo**: velocidade padrão (1×/2×/3×), mostrar textos de dano on/off (`warpoly.floatingText`; `ParticleSystem.spawnFloatingText` deve respeitar — mudança de 1 linha).

- Botões: "Restaurar padrão" por aba, "Fechar". Navegável por teclado; foco visível; Esc fecha.
- Integração: substituir o placeholder `#mm-options` do `MainMenu` pelo `OptionsPanel`; no jogo, a engrenagem abre o `OptionsPanel` (o `#settings-panel` antigo pode ser removido se tudo que ele fazia — velocidade, pausa, volumes, iluminação dia/pôr do sol/noite — estiver coberto; mova "Iluminação" para a aba Gráficos).
- Textos PT-BR.

## Restrições
Não editar `GameManager.js`, `Unit.js`, `Building.js`, `src/ai/**`, `src/sim/**` (determinismo em andamento local). `UIManager.js`: só o necessário para abrir o painel.

## Testes (Vitest)
`optionsStore.test.js`: camada de persistência pura (`src/ui/optionsStore.js`) — padrões, leitura/escrita, "restaurar padrão", valores inválidos no storage viram padrão.

## Verificação
`npm test`, `npm run lint`, `npx vite build`. Visual **pendente local** (liste no PR o que conferir).

## Entrega
Branch `cloud/F6-08`, commit `F6-08: menu de opções (gráficos, áudio, controles, interface, jogo)`.
