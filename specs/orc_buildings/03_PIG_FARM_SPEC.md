# 🐗 ASSET SPEC 03: Pig Farm (Fazenda de Porcos da Horda)
**Especificação Técnica de Modelo 3D & Integração Three.js**

---

## 1. Visão Geral do Asset
- **Nome do Arquivo Principal**: `pig_farm_orc.glb`
- **Nome do Sub-Asset**: `pig_character.glb`
- **Classe JavaScript Correspondente**: `src/entities/buildings/orc/PigFarm.js`
- **Tipo de Entidade**: `pig_farm`
- **Função em Jogo**: Fornece alimento e sustento para o exército Orc, concedendo `+5 de Capacidade Populacional` e gerando periodicamente recursos alimentares passivos (`+3 de ouro/suprimentos`).

---

## 2. Dimensões, Bounds e Colisão
- **Pegada no Solo (Footprint)**: `7.0m x 7.0m`.
- **Altura Total**: `3.8m` (até o teto do abrigo de palha e lama).
- **Raio de Colisão da Fazenda (`collisionRadius`)**: `2.8m`.
- **Área Interna do Cercado para os Porcos (`penRadius`)**: Raio de `2.1m` centrado em `(0.4, 0, 0.2)`.
- **Ponto de Pivô**: `(0, 0, 0)` no centro do cercado.

---

## 3. Descrição Visual e Geometria do Diorama
1. **Terreno de Lama Orgânica Detalhada**:
   - Chão de lama fofa, marrom-escuro e úmido (`#452c1e`), com poças de água barrenta e pegadas de cascos impressas na geometria.
2. **Cercado Rústico de Estacas**:
   - Paliçada irregular de toras verticais finas e pontiagudas, amarradas com cordas de cânhamo e couro.
   - Portãozinho de madeira lascada com fecho de osso.
3. **Abrigo Rústico (Chiqueiro)**:
   - Cobertura de três pilares sustentando um teto inclinado de sapê e couro velho com palha seca espetada.
4. **Cocho de Alimentação**:
   - Tronco escavado servindo de cocho com restos de raízes e comida esverdeada.
5. **Asset Separado: Porco Chunky Low-Poly (`pig_character.glb`)**:
   - Proporções cômicas e robustas: corpo arredondado, patas curtas e grossas, focinho avantajado com narinas marcadas e rabo em espiral.
   - 2 variantes de cor: Porco marrom-lama e Porco rosado-escuro sujo.

---

## 4. Estrutura de Nós dos Modelos glTF

### `pig_farm_orc.glb`
```
Root_PigFarm
├── Static_Mud_Terrain (Mesh - Lama detalhada com desníveis e poças)
├── Static_Fence_Poles (Mesh - Estacas e cordas da cerca)
├── Static_Shelter_Roof (Mesh - Abrigo de palha e postes)
├── Static_Trough_Feeder (Mesh - Cocho de comida escavado)
├── Area_PenBounds (Node com userData: { minX: -1.8, maxX: 2.2, minZ: -1.8, maxZ: 2.0 })
├── Socket_PigSpawn_01 (Empty - Local inicial do Porco 1: (-0.6, 0.0, -0.4))
├── Socket_PigSpawn_02 (Empty - Local inicial do Porco 2: (0.8, 0.0, 0.6))
├── Socket_PigSpawn_03 (Empty - Local inicial do Porco 3: (0.0, 0.0, 1.1))
└── Col_PigFarm (Mesh Convex)
```

### `pig_character.glb`
```
Root_Pig
├── Mesh_PigBody (Corpo, cabeça e patas integradas, ~280 triângulos)
├── Node_Snout (Focinho para animação procedural de farejar)
└── Node_Tail (Rabo em espiral)
```

---

## 5. Orçamento Técnico de Renderização
- **Pig Farm (Estrutura)**: ~2.800 triângulos.
- **Porco (Unidade Individual)**: ~280 triângulos (total para 3 porcos = ~840 triângulos).
- **Texturas**:
  - Fazenda: `T_PigFarm_BC.png`, `T_PigFarm_ORM.png`, `T_PigFarm_N.png` (1024x1024).
  - Porco: `T_Pig_BC.png` (512x512, compartilhado).

---

## 6. Requisitos de Animação e Efeitos Visuais (VFX no Three.js)
1. **Comportamento Autônomo dos Porcos (`PigEntity`)**:
   - Cada porco gerado pelo código Three.js executa uma máquina de estados autônoma:
     - **Vagar (Wandering)**: Escolhe um destino aleatório dentro do cercado (`Area_PenBounds`), vira-se suavemente na direção do alvo e anda com passos curtos balançando o corpo (`roll` suave de `sin(t * 8) * 0.08 rad`).
     - **Farejar / Pastar (Snuffling/Eating)**: Para próximo ao cocho ou na lama, abaixa o focinho e o oscila rapidamente para cima e para baixo.
     - **Descanso (Idling)**: Permanece parado farejando o ar, balançando o rabicó.
   - **Clamping Rígido**: As coordenadas dos porcos nunca ultrapassam os limites físicos do cercado (`x ∈ [-1.8, 2.2]`, `z ∈ [-1.8, 2.0]`).
2. **Efeito Sonoro e Notificação de Recursos**:
   - A cada 6 segundos de colheita, emite texto flutuante `+3 Comida` e particulado dourado.
