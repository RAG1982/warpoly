# 🪵 ASSET SPEC 06: Orc Lumbermill (Serraria de Guerra da Horda)
**Especificação Técnica de Modelo 3D & Integração Three.js**

---

## 1. Visão Geral do Asset
- **Nome do Arquivo**: `lumbermill_orc.glb`
- **Classe JavaScript Correspondente**: `src/entities/buildings/orc/OrcLumberMill.js`
- **Tipo de Entidade**: `orc_lumber_mill`
- **Função em Jogo**: Ponto de entrega e processamento industrial de madeira para os Peons Orcs. Fornece bônus de processamento florestal e pesquisas tecnológicas de machados e fortificação de madeira.

---

## 2. Dimensões, Bounds e Colisão
- **Pegada no Solo (Footprint)**: `8.5m x 7.5m`.
- **Altura Total**: `6.8m` (até o topo do guindaste de toras e armação da serra).
- **Raio de Colisão (`collisionRadius`)**: `3.2m`.
- **Área de Afastamento Mínimo (`clearanceRadius`)**: `6.0m` de outras construções; `6.0m` de árvores.
- **Ponto de Pivô**: `(0, 0, 0)` na base central do galpão.

---

## 3. Descrição Visual e Geometria do Diorama
1. **Pilhas de Toras Gigantescas Faturadas**:
   - Pilhas organizadas de toras grossas de pinheiro e carvalho com anéis de crescimento esculpidos nos topos (`#8c5832`), empilhadas contra a parede lateral (+X).
   - Troncos cortados amarrados com tiras de ferro e correntes enferrujadas.
2. **Galpão de Corte e Talhadora**:
   - Estrutura de madeira aberta com colunas rústicas e cobertura de vigas cruzadas reforçadas por placas de metal martelado.
   - Mesa de corte de madeira com rampa de alimentação de toras.
3. **Mecanismo Central: Grande Serra Circular Dentada (`Anim_SawBlade`)**:
   - Uma colossal lâmina de serra circular de ferro escuro (`raio = 1.35m`), cheia de dentes afiados triangulares e marcas de ferrugem e seiva.
   - Montada em um eixo cilíndrico horizontal com polias de corda e contra-pesos de pedra.
   - O nó `Anim_SawBlade` é uma malha independente cujo centro de rotação está exatamente no eixo horizontal da serra.
4. **Calha de Serragem e Cavacos**:
   - Calha de madeira de escoamento acumulando montes volumosos de serragem dourada e lascas de casca de árvore sob a lâmina.

---

## 4. Estrutura de Nós do Modelo glTF (`lumbermill_orc.glb`)

```
Root_OrcLumberMill
├── Static_Shed_Structure (Mesh - Galpão aberto de madeira e teto reforçado)
├── Static_Log_Piles (Mesh - Pilhas de toras cortadas e correntes)
├── Static_CuttingTable (Mesh - Mesa de corte e rampa de toras)
├── Static_SawMount (Mesh - Estrutura de suporte e mancais da serra)
├── Anim_SawBlade (Mesh - Lâmina de serra circular dentada)
│     Transform Pivot: Local Position (0.0, 1.6, 0.4)
│     Rotation Axis: Local X (ou Z dependendo da orientação do corte)
├── Socket_SawDust_Emitter (Empty - Emissor de lascas de madeira e serragem)
│     Transform: Local Position (0.0, 0.4, 0.4)
├── Socket_WoodDropoff (Empty - Ponto de descarga de madeira dos Peons)
│     Transform: Local Position (0.0, 0.0, 3.8)
└── Col_OrcLumberMill (Mesh Convex)
```

---

## 5. Orçamento Técnico de Renderização
- **Triângulos LOD0**: ~4.200 triângulos.
- **Triângulos LOD1**: ~2.100 triângulos.
- **Materiais**: 1 Material PBR Único (`Mat_OrcLumberMill_PBR`).
- **Texturas (Atlas 2048x2048)**:
  - `T_OrcLumberMill_BC.png`
  - `T_OrcLumberMill_ORM.png`
  - `T_OrcLumberMill_N.png`

---

## 6. Requisitos de Animação e Efeitos Visuais (VFX no Three.js)
1. **Rotação Contínua da Serra Circular (`Anim_SawBlade`)**:
   - No método `update(delta)`, gira continuamente em torno de seu próprio eixo:
     - Rotação base ociosa: `sawRotation += delta * 6.0 rad/s` (suave e constante).
     - Rotação sob entrega de madeira (Peon depositando toras): acelera para `delta * 18.0 rad/s` por 2.5 segundos, acompanhada por som de serra zunindo e explosão de cavacos de madeira (`ParticleSystem.spawnWoodChips()`) saindo de `Socket_SawDust_Emitter`.
2. **Depósito Automático de Recursos**:
   - Quando um Peon colide com a área de entrega, a serra acelera, a madeira é adicionada ao inventário do jogador e uma notificação flutuante `+10 Madeira` surge sobre o galpão.
