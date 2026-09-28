# 🏹 ASSET SPEC 05: Orc Watchtower (Torre de Vigia e Defesa)
**Especificação Técnica de Modelo 3D & Integração Three.js**

---

## 1. Visão Geral do Asset
- **Nome do Arquivo**: `watchtower_orc.glb`
- **Classe JavaScript Correspondente**: `src/entities/buildings/orc/OrcWatchtower.js`
- **Tipo de Entidade**: `orc_watchtower`
- **Função em Jogo**: Posto de vigilância e baluarte defensivo da Horda. Concede visão ampla através da Névoa de Guerra (raio de visão `28m`) e dispara machados arremessáveis contra inimigos invasores em um raio de `18m`.

---

## 2. Dimensões, Bounds e Colisão
- **Pegada no Solo (Footprint)**: `5.0m x 5.0m`.
- **Altura Total**: `9.6m` (até o topo do mastro e chamas do braseiro).
- **Raio de Colisão (`collisionRadius`)**: `2.0m`.
- **Área de Afastamento Mínimo (`clearanceRadius`)**: `4.5m` de outras construções; `4.5m` de árvores.
- **Ponto de Pivô**: `(0, 0, 0)` na base térrea central.

---

## 3. Descrição Visual e Geometria do Diorama
1. **Base Piramidal e Estrutura de Vigas**:
   - Quatro troncos maciços de carvalho escuro inclinados para dentro, amarrados em três níveis com travessas horizontais e cordas de couro.
   - Reforços pontiagudos de estacas afiadas (*punji spikes*) na base impedindo ataque direto.
2. **Escadas e Amarração**:
   - Escada rústica de degraus de madeira lascada subindo pela face traseira (-Z) até a plataforma superior.
3. **Ninho do Atirador / Plataforma de Batalha (Altura: `6.5m`)**:
   - Plataforma circular de tábuas grossas cercada por um parapeito denteado de troncos lascados e placas de ferro com frestas de tiro.
   - Espaço para uma unidade orc (Lançador de Machados) posicionar-se visualmente.
4. **Braseiro Suspenso da Horda (`Socket_Brazier`)**:
   - Uma grande bacia de ferro fundido sustentada por correntes pesadas no topo da torre (`Y = 8.5m`), cheia de brasas incandescentes e toras acesas ardendo contra o céu.

---

## 4. Estrutura de Nós do Modelo glTF (`watchtower_orc.glb`)

```
Root_OrcWatchtower
├── Static_Base_Spikes (Mesh - Estacas pontiagudas de defesa na base)
├── Static_Tower_Poles (Mesh - Vigas mestras e travessas amarradas)
├── Static_Ladder (Mesh - Escada de acesso à plataforma)
├── Static_CrowPlatform (Mesh - Piso da plataforma e parapeito denteado)
├── Static_IronBrazier (Mesh - Bacia de ferro do braseiro de guerra)
├── Socket_BrazierFire (Empty - Ponto de origem das partículas de fogo)
│     Transform: Local Position (0.0, 8.4, 0.0)
├── Socket_BrazierLight (Empty - Ponto da PointLight piscante)
│     Transform: Local Position (0.0, 8.7, 0.0)
├── Socket_ShooterStation (Empty - Ponto onde o atirador fica posicionado)
│     Transform: Local Position (0.0, 6.6, 0.4)
├── Socket_ProjectileLaunch (Empty - Ponto de disparo dos machados)
│     Transform: Local Position (0.0, 7.8, 0.0)
└── Col_OrcWatchtower (Mesh Convex)
```

---

## 5. Orçamento Técnico de Renderização
- **Triângulos LOD0**: ~3.200 triângulos.
- **Triângulos LOD1**: ~1.600 triângulos.
- **Materiais**: 1 Material PBR Único (`Mat_OrcWatchtower_PBR`).
- **Texturas (Atlas 1024x1024)**:
  - `T_OrcWatchtower_BC.png`
  - `T_OrcWatchtower_ORM.png`
  - `T_OrcWatchtower_N.png`
  - `T_OrcWatchtower_E.png` (Emissivo do braseiro ardente)

---

## 6. Requisitos de Animação e Efeitos Visuais (VFX no Three.js)
1. **Luz Dinâmica do Braseiro (`Socket_BrazierLight`)**:
   - `PointLight` Three.js com cor vermelho-alaranjada (`#ff5511`), alcance de `16m`, com cintilação procedural no `update(delta)`:
     - `intensity = 2.2 + sin(time * 12.0) * 0.45 + cos(time * 23.0) * 0.25`.
2. **Partículas de Chamas e Fagulhas (`Socket_BrazierFire`)**:
   - Emissão contínua de fagulhas douradas ascendentes (`spawnHitSparks()` estilizado para brasas) e partículas de labaredas com deslocamento vertical rápido.
3. **Disparo de Machados Automático**:
   - Quando um inimigo entra no raio de 18m, lança um machado orc giratório saindo de `Socket_ProjectileLaunch` com rastro cortante e som de impacto metálico.
