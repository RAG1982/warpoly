# 🔨 ASSET SPEC 07: Orc Forge (Forja de Guerra e Armaria)
**Especificação Técnica de Modelo 3D & Integração Three.js**

---

## 1. Visão Geral do Asset
- **Nome do Arquivo**: `forge_orc.glb`
- **Classe JavaScript Correspondente**: `src/entities/buildings/orc/OrcForge.js`
- **Tipo de Entidade**: `orc_forge`
- **Função em Jogo**: Centro metalúrgico da Horda. Permite aprimorar o dano de armas cortantes (+Ataque para Grunts e Axethrowers), dureza de escudos de ferro (+Armadura) e forja de armaduras pesadas para Ogres.

---

## 2. Dimensões, Bounds e Colisão
- **Pegada no Solo (Footprint)**: `8.0m x 7.5m`.
- **Altura Total**: `8.2m` (até o topo da chaminé com anéis de ferro).
- **Raio de Colisão (`collisionRadius`)**: `3.4m`.
- **Área de Afastamento Mínimo (`clearanceRadius`)**: `6.5m` de outras construções; `6.5m` de árvores.
- **Ponto de Pivô**: `(0, 0, 0)` na base central da fornalha.

---

## 3. Descrição Visual e Geometria do Diorama
1. **Estrutura de Alvenaria Vulcânica e Ferro Fundido**:
   - Paredes espessas de pedra de basalto negro escurecida por fuligem (`#3b3839`) com juntas de argamassa cinzenta.
   - Reforços de vigas de ferro negro batido nas quinas e abóbada de pedra refratária.
2. **Fornalha Incandescente de Boca Aberta**:
   - Boca da fornalha em arco semicircular na face frontal (+Z), revelando um leito de carvão em brasa ardente e metal derretido.
   - Grade protetora de ferro denteado na borda inferior.
   - Malha independente ou plano de shader para as labaredas (`Mesh_FurnaceFlames`).
3. **Oficina de Forja (Bigorna, Fole e Ferramentas)**:
   - Uma bigorna de ferro forjado maciça montada sobre um toco de carvalho escuro em frente à fornalha.
   - Tenazes com lâmina incandescente alaranjada pousadas na bigorna.
   - Fole de couro e madeira articulado na lateral com alavanca de acionamento.
   - Tina de têmpera de água fumegante ao lado.
4. **Chaminé Monumental de Fuligem**:
   - Chaminé alta de alvenaria cilíndrica afunilada, com cintas de contenção de ferro negro rebitadas e boca cônica expelindo fuligem.

---

## 4. Estrutura de Nós do Modelo glTF (`forge_orc.glb`)

```
Root_OrcForge
├── Static_Stone_Furnace (Mesh - Fornalha de pedra de basalto e alvenaria)
├── Static_Chimney (Mesh - Chaminé alta com anéis de ferro)
├── Static_Anvil_Bench (Mesh - Bigorna, toco de carvalho e tina de têmpera)
├── Static_Bellows (Mesh - Fole de couro mecânico)
├── Static_IronRoof (Mesh - Telhado parcial de chapas rebitadas)
├── Mesh_FurnaceFlames (Mesh - Geometria das chamas com shader de fogo animado)
├── Socket_FurnaceFire (Empty - Ponto do fogo da fornalha)
│     Transform: Local Position (0.0, 1.3, 1.2)
├── Socket_FurnaceLight (Empty - Ponto da PointLight intensa piscante)
│     Transform: Local Position (0.0, 1.5, 1.5)
├── Socket_ChimneySmoke (Empty - Saída de fumaça preta espessa)
│     Transform: Local Position (-1.8, 8.0, -1.2)
├── Socket_AnvilSparks (Empty - Ponto de faíscas ao bater do martelo)
│     Transform: Local Position (1.6, 1.1, 2.2)
└── Col_OrcForge (Mesh Convex)
```

---

## 5. Orçamento Técnico de Renderização
- **Triângulos LOD0**: ~4.100 triângulos.
- **Triângulos LOD1**: ~2.050 triângulos.
- **Materiais**: 
  - `Mat_OrcForge_PBR` (Opaco: pedras, ferro, bigorna, madeira).
  - `Mat_OrcFurnace_Fire` (Emissivo/Transparente com shader de chamas animadas).
- **Texturas (Atlas 2048x2048)**:
  - `T_OrcForge_BC.png`
  - `T_OrcForge_ORM.png`
  - `T_OrcForge_N.png`
  - `T_OrcForge_E.png` (Glow emissivo alaranjado intenso no interior da fornalha)

---

## 6. Requisitos de Animação e Efeitos Visuais (VFX no Three.js)
1. **Fogo Intenso na Fornalha (`Socket_FurnaceLight` & `Mesh_FurnaceFlames`)**:
   - `PointLight` potente com cor laranja incandescente (`#ff4500` / `#ff7700`), alcance de `14m`:
     - Pulsação de calor termodinâmico no `update(delta)`:
       - `intensity = 3.2 + sin(time * 14.0) * 0.7 + sin(time * 29.0) * 0.4`.
   - As chamas (`Mesh_FurnaceFlames`) utilizam distorção procedural de UV / senoide ou shader de fogo com translação vertical contínua da textura de ruído.
2. **Chaminé com Fumaça Preta Espessa de Carvão (`Socket_ChimneySmoke`)**:
   - Emissão frequente a cada `0.45s` de densas partículas de fumaça preta com alta opacidade (`#1a1918` a `#2b2725`), subindo com força convectiva (`1.5 m/s`) e expandindo no topo.
3. **Faíscas na Bigorna (`Socket_AnvilSparks`)**:
   - Quando uma pesquisa ou aprimoramento de armas é ativado, emite um spray de faíscas brilhantes incandescentes de ferro quente (`particleSystem.spawnHitSparks()`).
