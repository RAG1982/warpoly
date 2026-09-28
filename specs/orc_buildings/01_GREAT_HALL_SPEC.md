# 🏛️ ASSET SPEC 01: Great Hall (Centro da Vila Orc)
**Especificação Técnica de Modelo 3D & Integração Three.js**

---

## 1. Visão Geral do Asset
- **Nome do Arquivo**: `great_hall_orc.glb`
- **Classe JavaScript Correspondente**: `src/entities/buildings/orc/GreatHall.js`
- **Tipo de Entidade**: `great_hall`
- **Função em Jogo**: Edifício central (Quartel-General) da civilização Orc. Recebe recursos entregues (madeira, ouro), treina Peons, concede limite populacional e resiste a ataques pesados.

---

## 2. Dimensões, Bounds e Colisão
- **Pegada no Solo (Footprint)**: `11.0m x 11.0m` (retangular chanfrada).
- **Altura Total**: `10.8m` (até o cume da torre de chifres e chaminé central).
- **Raio de Colisão (`collisionRadius`)**: `5.5m`.
- **Área de Afastamento Mínimo (`clearanceRadius`)**: `8.5m` de outras construções; `10.0m` de árvores.
- **Ponto de Pivô**: `(0, 0, 0)` na base central do piso térreo.

---

## 3. Descrição Visual e Geometria do Diorama
1. **Base e Fundações**:
   - Plataforma elevada em pedra vulcânica escura talhada (`#3b3839`) com degraus rústicos na entrada frontal (+Z).
   - Paredes inclinadas de troncos maciços empilhados verticalmente e amarrados com tiras grossas de couro curtido.
2. **Entrada Monumental**:
   - Arco de portal sustentado por duas presas gigantescas de mamute fóssil (`#ded0a5`) que se cruzam no topo.
   - Porta de ferro escuro batido com tachas gigantes e caveira de fera no tímpano.
3. **Telhado e Torre de Observação do Chefe**:
   - Telhado de quatro águas recoberto por peles de kodo esticadas com costuras visíveis de tendão.
   - Ninho de observação superior com parapeito de paliçadas pontiagudas e reforços de ferro forjado.
4. **Chaminé Central**:
   - Chaminé de alvenaria rústica reforçada com anéis de ferro negro saindo pela lateral superior traseira (-X, -Z).
5. **Estandartes de Guerra da Horda**:
   - Dois mastros salientes de madeira pontiaguda com estandartes carmesins rasgados balançando com o vento.

---

## 4. Estrutura de Nós do Modelo glTF (`great_hall_orc.glb`)

```
Root_GreatHall
├── Static_Base_Plataform (Mesh - Pedras de fundação e degraus)
├── Static_Walls_Timbers (Mesh - Troncos de sustentação e ferragens)
├── Static_Roof_Hides (Mesh - Telhado de peles e costuras)
├── Static_Tusks_Entrance (Mesh - Presas monumentais e crânio)
├── Static_Chimney (Mesh - Chaminé de ferro e pedra)
├── Anim_WarBanner_Left (Mesh - Separado para animação procedural / shader)
├── Anim_WarBanner_Right (Mesh - Separado para animação procedural / shader)
├── Socket_ChimneySmoke (Empty - Local de saída das partículas de fumaça)
│     Transform: Local Position (-2.4, 9.8, -2.0)
├── Socket_BrazierFire (Empty - Fogo da tocha de entrada)
│     Transform: Local Position (2.8, 3.2, 4.2)
├── Socket_UnitSpawn (Empty - Saída de Peons recém-treinados)
│     Transform: Local Position (0.0, 0.0, 6.8)
├── Socket_RallyPoint (Empty - Ponto de reunião padrão)
│     Transform: Local Position (0.0, 0.0, 8.5)
└── Col_GreatHall (Mesh Convex - Colisor simplificado)
```

---

## 5. Orçamento Técnico de Renderização
- **Triângulos LOD0**: ~5.200 triângulos.
- **Triângulos LOD1**: ~2.600 triângulos (a mais de 45m de distância).
- **Materiais**: 1 Material PBR Único (`Mat_OrcGreatHall_PBR`).
- **Texturas (Atlas 2048x2048)**:
  - `T_OrcGreatHall_BC.png` (Base Color + Baked AO)
  - `T_OrcGreatHall_ORM.png` (Occlusion, Roughness, Metalness)
  - `T_OrcGreatHall_N.png` (Normal Map)
  - `T_OrcGreatHall_E.png` (Emissive - janelas internas incandescentes)

---

## 6. Requisitos de Animação e Efeitos Visuais (VFX no Three.js)
1. **Flutuação dos Estandartes de Guerra (`Anim_WarBanner_Left`, `Anim_WarBanner_Right`)**:
   - Oscilação harmônica contínua acionada no `update(delta)`:
     - Rotação senoidal suave em torno do eixo Y e Z simulando vento soprando (`sin(time * 3.5 + offset) * 0.12 rad`).
2. **Fumaça da Chaminé do Conselho (`Socket_ChimneySmoke`)**:
   - Emissão contínua a cada `0.7s` de golfadas de fumaça cinza-escura (`ParticleSystem.spawnSmokePuff()`), com dispersão vertical e leve drift ao vento.
3. **Tocha de Entrada / Braseiro (`Socket_BrazierFire`)**:
   - `PointLight` dourado/alaranjado (`#ff6b2b`, intensidade `1.8`, distância `9m`) com cintilação suave de chama viva.
