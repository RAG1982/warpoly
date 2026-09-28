# ⚔️ ASSET SPEC 02: Orc Barracks (Quartel dos Guerreiros)
**Especificação Técnica de Modelo 3D & Integração Three.js**

---

## 1. Visão Geral do Asset
- **Nome do Arquivo**: `barracks_orc.glb`
- **Classe JavaScript Correspondente**: `src/entities/buildings/orc/OrcBarracks.js`
- **Tipo de Entidade**: `orc_barracks`
- **Função em Jogo**: Centro de recrutamento e treinamento militar da Horda Orc. Treina Grunts, Lançadores de Machado (Axethrowers) e Ogres de Combate.

---

## 2. Dimensões, Bounds e Colisão
- **Pegada no Solo (Footprint)**: `8.5m x 8.5m`.
- **Altura Total**: `7.5m` (até o cume dos machados cruzados do telhado).
- **Raio de Colisão (`collisionRadius`)**: `3.6m`.
- **Área de Afastamento Mínimo (`clearanceRadius`)**: `6.5m` de outras construções; `6.5m` de árvores.
- **Ponto de Pivô**: `(0, 0, 0)` na base central.

---

## 3. Descrição Visual e Geometria do Diorama
1. **Paredes Fortificadas e Paliçada**:
   - Troncos afiados inclinados para fora formando uma estacada defensiva espinhosa ao redor da base.
   - Cantoneiras de ferro negro rebitadas segurando as junções das vigas de carvalho escuro.
2. **Telhado de Chapa Metálica e Peles**:
   - Telhado angular assimétrico combinando lâminas de metal martelado e esteiras de couro escurecido.
   - No cume do telhado, dois machados orcs gigantes de lâmina dupla cruzados com pinturas tribais vermelhas.
3. **Pátio de Armas e Mostruário Bélico**:
   - Suportes laterais com lanças serrilhadas, escudos de ferro com pontas e machados cravados em toras.
   - Caveiras de humanos e troféus de caça cravados em estacas na fachada.
4. **Boneco de Treinamento Pendurado (`Anim_TrainingDummy`)**:
   - Uma viga saliente em balanço sustenta uma corda grossa onde fica pendurado um boneco de palha/saco de estopa reforçado com elmo amassado e armadura de retalhos.
   - O boneco é uma malha independente com pivô no ponto de amarração superior da corda.

---

## 4. Estrutura de Nós do Modelo glTF (`barracks_orc.glb`)

```
Root_OrcBarracks
├── Static_Base_Timber (Mesh - Estrutura principal de madeira e chão batido)
├── Static_Roof_Spikes (Mesh - Telhado com machados cruzados e ferragens)
├── Static_WeaponRacks (Mesh - Lanças, machados e escudos expostos)
├── Static_GallowsArm (Mesh - Viga de sustentação da corda do boneco)
├── Anim_TrainingDummy (Mesh - Boneco de treino pendurado, com pivô no topo)
│     Transform Pivot: Local Position (2.8, 4.2, 1.5)
├── Socket_UnitSpawn (Empty - Saída de Grunts e Guerreiros)
│     Transform: Local Position (0.0, 0.0, 5.0)
├── Socket_RallyPoint (Empty - Ponto de encontro da tropa)
│     Transform: Local Position (0.0, 0.0, 6.5)
└── Col_OrcBarracks (Mesh Convex - Colisor cilíndrico/caixa)
```

---

## 5. Orçamento Técnico de Renderização
- **Triângulos LOD0**: ~3.900 triângulos.
- **Triângulos LOD1**: ~1.950 triângulos.
- **Materiais**: 1 Material PBR Único (`Mat_OrcBarracks_PBR`).
- **Texturas (Atlas 2048x2048)**:
  - `T_OrcBarracks_BC.png`
  - `T_OrcBarracks_ORM.png`
  - `T_OrcBarracks_N.png`

---

## 6. Requisitos de Animação e Efeitos Visuais (VFX no Three.js)
1. **Física Pendular do Boneco de Treino (`Anim_TrainingDummy`)**:
   - O boneco oscila permanentemente com um pêndulo físico sutil (`sin(time * 2.2) * 0.08 rad`).
   - **Impacto de Treinamento**: Quando um novo guerreiro (Grunt/Axethrower) completa o treinamento no quartel, o boneco recebe um golpe simulado:
     - Impulso angular imediato (`dummyAngleVel = 0.65 rad/s`), amortecido suavemente por atrito ao longo de 2 segundos.
     - Efeito sonoro de impacto de lâmina e partículas de palha/lascas de madeira voando (`ParticleSystem.spawnWoodChips()`).
