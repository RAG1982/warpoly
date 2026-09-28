# ⛺ ASSET SPEC 04: Orc House / Burrow (Cabana / Toca dos Peons)
**Especificação Técnica de Modelo 3D & Integração Three.js**

---

## 1. Visão Geral do Asset
- **Nome do Arquivo**: `house_burrow_orc.glb`
- **Classe JavaScript Correspondente**: `src/entities/buildings/orc/OrcHouse.js`
- **Tipo de Entidade**: `orc_house`
- **Função em Jogo**: Habitação básica e refúgio dos trabalhadores Orcs. Concede `+6 de Capacidade Populacional`, com custo reduzido de madeira e pegada compacta no terreno.

---

## 2. Dimensões, Bounds e Colisão
- **Pegada no Solo (Footprint)**: `6.0m x 6.0m`.
- **Altura Total**: `4.5m` (até o topo da cúpula de pele e chaminé rústica).
- **Raio de Colisão (`collisionRadius`)**: `2.8m`.
- **Área de Afastamento Mínimo (`clearanceRadius`)**: `5.5m` de outras construções; `5.5m` de árvores.
- **Ponto de Pivô**: `(0, 0, 0)` na base central da toca.

---

## 3. Descrição Visual e Geometria do Diorama
1. **Fundação Semi-Subterrânea ("Toca Escavada")**:
   - Base rebaixada no solo com mureta de pedras e toras de contenção, criando a sensação de um covil escavado.
2. **Cúpula Cônica de Peles Costuradas**:
   - Telhado piramidal/cônico composto por retalhos grossos de couro de kodo e pelo de mamute, com costuras salientes em zigue-zague de corda grossa.
   - Presas pontiagudas de javali gigante cravadas nas bordas do telhado.
3. **Entrada Baixa e Fortificada**:
   - Pórtico baixo reforçado com vigas de madeira lascada e cortina de couro rasgada na porta.
   - Crânio de lobo ou troféu de ossada fixado acima do umbral.
4. **Respiradouro / Buraco de Fumaça no Teto (`Socket_RoofHole`)**:
   - Abertura cônica no cume da cobertura de couro, com suporte de madeira cruzada em formato de tripé, de onde emana fumaça da fogueira interna.

---

## 4. Estrutura de Nós do Modelo glTF (`house_burrow_orc.glb`)

```
Root_OrcHouse
├── Static_EarthenBase (Mesh - Montículo de terra e mureta de pedra)
├── Static_TimberFrame (Mesh - Postes de sustentação e portal)
├── Static_HideRoof (Mesh - Telhado de peles costuradas com costuras salientes)
├── Static_TuskOrnaments (Mesh - Presas e ossadas decorativas)
├── Socket_RoofHole (Empty - Ponto de saída da fumaça da fogueira interna)
│     Transform: Local Position (0.0, 4.4, 0.0)
├── Socket_InteriorGlow (Empty - Ponto para iluminação interna âmbar)
│     Transform: Local Position (0.0, 1.2, 0.5)
└── Col_OrcHouse (Mesh Convex)
```

---

## 5. Orçamento Técnico de Renderização
- **Triângulos LOD0**: ~2.200 triângulos.
- **Triângulos LOD1**: ~1.100 triângulos.
- **Materiais**: 1 Material PBR Único (`Mat_OrcHouse_PBR`).
- **Texturas (Atlas 1024x1024)**:
  - `T_OrcHouse_BC.png`
  - `T_OrcHouse_ORM.png`
  - `T_OrcHouse_N.png`

---

## 6. Requisitos de Animação e Efeitos Visuais (VFX no Three.js)
1. **Fumaça Leve e Esgalhada do Telhado (`Socket_RoofHole`)**:
   - Emissão periódica a cada `0.9s` de plumas suaves e translúcidas de fumaça de acampamento (`ParticleSystem.spawnSmokePuff()`), com velocidade ascendente suave (`0.8 m/s`) e expansão gradual.
2. **Brilho Interno da Lareira (`Socket_InteriorGlow`)**:
   - `PointLight` suave âmbar/laranja (`#ff9e42`, intensidade `0.8`, distância `4m`) visível escapando pela fresta da porta de couro e pelo buraco superior do teto.
