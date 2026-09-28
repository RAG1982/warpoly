# 07 — Decisões de produto

Registro das decisões do dono do projeto. Toda tarefa deve respeitá-las; mudanças aqui exigem aprovação dele.

| # | Data | Decisão | Impacto |
|---|---|---|---|
| D1 | 2026-09-28 | **Pedra continua** como recurso. **Petróleo** entra como 4º recurso, **liberado apenas após o upgrade do Centro da Cidade para o Tier 2** (antes disso poços de petróleo ficam visíveis mas não exploráveis e as construções navais/de petróleo ficam bloqueadas). | F3-04, F3-06, F4-07, UI da barra de recursos (petróleo aparece ao liberar), IA (F5-04) |
| D2 | 2026-09-28 | **Nomes próprios** em tudo: facções, unidades, construções, magias, heróis e lore. Nada de nomes/marcas da Blizzard (Grunt, Peon, Horda, Aliança, Death Knight etc. devem ser substituídos). Mecânicas inspiradas no WC2 são permitidas. | F3-00 define o glossário oficial; F6-09 (i18n) aplica; textos atuais serão migrados |
| D3 | 2026-09-28 | **Hardware**: rodar com facilidade no hardware mais limitado possível **sem sacrificar a qualidade AAA** nos presets altos nem a direção de arte nos baixos. | Ver alvos abaixo |

## D2 — nomes provisórios (até o glossário da F3-00)

Enquanto o glossário oficial não é aprovado, usar termos genéricos, sem marca: **"Reino Humano"** e **"Clãs Orcs"** para as facções; nomes de unidade descritivos em PT-BR (Trabalhador, Guerreiro, Arremessador, Ogro…).

## D3 — alvos de hardware

| Perfil | Hardware de referência | Preset | Alvo |
|---|---|---|---|
| Mínimo | Notebook com GPU integrada (Intel UHD 620 / AMD Vega 8), 8 GB RAM, navegador atual | **Baixo** | ≥ 30 FPS estáveis em 1080p com escala de resolução, 200 unidades; load < 10 s |
| Recomendado | GPU dedicada de entrada (GTX 1650 / RX 6500) | **Médio/Alto** | 60 FPS em 1080p |
| Entusiasta | RX 7600 XT e acima | **Ultra** | 60–144 FPS em 1440p/4K, todos os efeitos |

Regras para o preset Baixo **não ficar feio**:
- Manter silhuetas, paleta, iluminação principal e legibilidade das unidades.
- Cortar primeiro: resolução interna (com upscale nítido), sombras suaves → sombras simples de blob/contato, pós-processamento, densidade de decoração, partículas, distância de LOD.
- Nunca cortar: cores de time, animações principais, feedback de combate, clareza da HUD.
- Suporte a mobile/tablet: desejável, não prioritário (reavaliar após F1).

## Pendentes

- TypeScript (migração gradual por JSDoc) — sem decisão; padrão até lá: JS + JSDoc.
