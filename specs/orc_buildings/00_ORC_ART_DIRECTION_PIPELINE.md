# 🎨 Direção de Arte Geral & Pipeline Técnico — Facção Orc (WarPoly RTS)
**Documento do Artista Técnico & Diretor de Arte**

---

## 1. Visão Artística: "Diorama em Miniatura, Warcraft 2 Modernizado"

A Facção Orc de WarPoly deve evocar o espírito tribal, agressivo e monumental de **Warcraft 2: Tides of Darkness**, reinterpretado com o requinte técnico de jogos estilizados modernos como **Valorant**, **Overwatch** e miniaturas físicas de diorama de alta qualidade (*tabletop miniature wargaming*).

### Pilares Estilísticos:
1. **Silhueta "Chunky" & Formas Fortes**:
   - Proporções exageradas e encorpadas. Nada de estruturas finas ou frágeis.
   - Vigas de madeira grossas, chanfros generosos (bevels largos de 45°), troncos com casca rústica e pontas lascadas.
   - Formas triangulares e pontiagudas dominantes, transmitindo perigo e agressividade territorial.
2. **Materiais Brutais e Tribais**:
   - **Madeira Lascada e Queimada**: Carvalho e pinho escuros, com nós visíveis e marcas de corte de machado.
   - **Ferro Negro Batido (*Shadow Iron*)**: Placas metálicas forjadas à mão, irregulares, presas por rebites brutos e pregos tortos.
   - **Presas, Chifres e Ossadas de Feras**: Marfim envelhecido, amarelado pelo sol e sangue seco, adornando portais e beiradas.
   - **Couros e Peles Costuradas**: Peles de feras (kodo, mamute, javali) com costuras grosseiras de tendão e manchas de sujeira.
3. **Pinturas de Guerra e Heraldica da Horda**:
   - Vermelho Carmesim / Sangue Vivo (`#c52828` a `#e63946`) em estandartes, símbolos rúnicos e faixas.
   - Marcas de garra e runas orcs aplicadas como stencil desgastado sobre a madeira e ferro.
4. **Escala de Diorama em Miniatura**:
   - Os modelos devem parecer miniaturas colecionáveis esculpidas à mão: superfícies levemente facetadas (low-to-mid poly estilizado), bevels destacados para capturar o specular do sol e bordas realçadas (*edge highlights* pintados).

---

## 2. Paleta de Cores Mestra (PBR Albedo)

| Material | Cor Hex Principal | Descrição |
| :--- | :--- | :--- |
| **Ferro Forjado Batido** | `#2d2f36` | Ferro escuro com leves nuances azuladas e desgaste prateado nas bordas. |
| **Borda Metálica Chanfrada** | `#7d8597` | Highlights chanfrados de metal cru batido e afiado. |
| **Madeira Rústica Escura** | `#5c3a21` | Madeira de lei encorpada, tratada com piche e fumaça. |
| **Madeira Clara Lascada** | `#8c5832` | Lascas e cortes recentes expostos nos troncos pontiagudos. |
| **Couro Curtido de Fera** | `#a3683b` | Peles e couros esticados sobre estruturas e telhados. |
| **Presas / Marfim** | `#ded0a5` | Osso e presas amareladas com ranhuras de desgaste `#8b7d52`. |
| **Tecido de Guerra Vermelho** | `#b81d24` | Carmesim vibrante dos estandartes da Horda. |
| **Pedra Escurecida / Basalto** | `#3b3839` | Rochas vulcânicas e alvenaria bruta para fundações. |
| **Lamaçal e Solo Revirado** | `#452c1e` | Lama úmida e fofa sob as cercas e currais. |
| **Fogo / Brasa Emissiva** | `#ff5d1a` a `#ffbf36` | Chamas ardentes em fornalhas, braseiros e tochas. |

---

## 3. Pipeline de Modelação & Orçamento de Polígonos

- **Formato Final**: `.glb` (glTF 2.0 binário) com hierarquia de nodes limpa.
- **Eixo e Escala**:
  - `Y-Up`, `Z-Forward`.
  - `1 unidade = 1 metro` no mundo WarPoly.
  - Ponto de pivô (`0, 0, 0`) centralizado exatamente na base da construção (ao nível do solo `Y = 0`).
- **Orçamento de Triângulos (LOD0)**:
  - **Great Hall (Tier 1)**: 4.500 – 6.000 triângulos.
  - **Barracks**: 3.500 – 4.500 triângulos.
  - **Pig Farm**: 2.800 – 3.800 triângulos (incluindo cerca e cocho).
  - **House / Burrow**: 1.800 – 2.500 triângulos.
  - **Watchtower**: 2.500 – 3.500 triângulos.
  - **Lumbermill**: 3.800 – 4.800 triângulos (incluindo mecanismo de serra/moinho).
  - **Forge**: 3.500 – 4.500 triângulos (incluindo bigorna, chaminé e fornalha).
- **Orçamento de LOD1 (Distância > 40 unidades)**: Redução de 50% de polígonos, fundindo detalhes menores.

---

## 4. Convenção de Nomenclatura de Nós (Scene Graph Hierarchy)

Todos os assets `.glb` devem seguir rigorosamente a seguinte convenção de nós para integração direta com a engine Three.js:

- `Root_[BuildingName]`: Nó raiz da construção.
- `Static_Mesh`: Malhas estáticas fundidas com o mesmo material para minimizar draw calls.
- `Anim_[PartName]`: Peças animadas dinamicamente via código Three.js (ex: `Anim_SawBlade`, `Anim_Banner_01`, `Anim_Dummy`).
- `Socket_[Type]_[Index]`: Nós *Empty* vazios sem geometria, usados para acoplar emissores de partículas, luzes dinâmicas ou unidades:
  - `Socket_Fire`: Posição de fogo/braseiro.
  - `Socket_Light`: Posição de PointLight dinâmica.
  - `Socket_Smoke`: Posição de saída de fumaça da chaminé.
  - `Socket_Rally`: Ponto de reunião padrão.
  - `Socket_UnitSpawn`: Ponto exato de saída dos guerreiros recém-treinados.
- `Col_[BuildingName]`: Geometria simplificada convexa usada como colisor físico.

---

## 5. Especificação de Texturas e Materiais PBR

- **Texturas Empacotadas (PBR Standard Metallic-Roughness)**:
  1. `BaseColor` (sRGB, 1024x1024 ou 2048x2048): Hand-painted com Baked Ambient Occlusion sutil e highlights de borda integrados.
  2. `Normal` (Linear, DirectX / OpenGL compatível com Three.js): Chanfros largos e ranhuras de madeira exageradas.
  3. `Roughness` (Linear, Canal Verde no ORM):
     - Metais: 0.28 – 0.45 (refletem a luz solar direta).
     - Madeira: 0.70 – 0.85 (acabamento fosco rústico).
     - Couros e Peles: 0.60 – 0.75.
  4. `Metalness` (Linear, Canal Azul no ORM): 1.0 para placas de ferro, 0.0 para madeira, peles e pedras.
  5. `Emissive` (sRGB, se aplicável): 0x000000 para a maioria, com texturas incandescentes para forjas e braseiros.
