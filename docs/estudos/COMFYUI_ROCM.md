# Estudo: ComfyUI leve em ROCm (RX 7600 XT) dirigido pelo Claude Code

Data: 2026-11-25. Estado: estudo, nada instalado ainda.

## 1. Máquina (verificado)

| Item | Valor |
|---|---|
| GPU | RX 7600 XT 16 GB, `gfx1102` (RDNA3), banda 288 GB/s |
| ROCm do sistema | 7.2.1 (`/opt/rocm-7.2.1`), usuário nos grupos `video` e `render` |
| CPU / RAM | Xeon E5-2680 v4 (PCIe 3.0) / 31 GB |
| Disco livre | 106 GB em `/` |
| SO / Python | Zorin OS 18.1, kernel 6.17 / Python 3.12.3, `uv` instalado |

Pontos fracos: banda de VRAM baixa e PCIe 3.0. Offload para a RAM fica lento. Modelos que
cabem inteiros na VRAM rendem muito mais que modelos grandes com offload.

## 2. Instalação recomendada (mínima)

Sem ComfyUI Desktop, sem ComfyUI-Manager, sem Docker. Um diretório, um venv.

```bash
mkdir -p ~/ai && cd ~/ai
git clone --depth 1 https://github.com/Comfy-Org/ComfyUI.git
cd ComfyUI
uv venv --python 3.12 .venv          # docs aceitam 3.12; 3.13 é a preferida
source .venv/bin/activate
uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/rocm7.2
uv pip install -r requirements.txt
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
python main.py --listen 127.0.0.1 --port 8188
```

- O wheel `rocm7.2` traz as próprias bibliotecas ROCm; casa com o ROCm 7.2.1 do sistema.
- Só se `torch.cuda.is_available()` falhar: `HSA_OVERRIDE_GFX_VERSION=11.0.0 python main.py`
  (a doc do ComfyUI cita isso para a 7600).
- Opcional, depois que tudo funcionar: `PYTORCH_TUNABLEOP_ENABLED=1` (primeira execução bem lenta).
- Nós extras (em `custom_nodes/`): apenas o carregador GGUF (ver seção 3.1).
- Espaço estimado: ComfyUI + venv com torch ROCm ≈ 10–12 GB.

## 3. Modelos

### 3.1 Imagem: Krea 2 Turbo quantizado (recomendado)

DiT de 12B, arquitetura própria (`krea2`, não é Flux). Turbo é destilado: 4–8 passos, CFG 0–1.

| Arquivo | Origem | Pasta | Tamanho |
|---|---|---|---|
| `krea2_turbo_bf16-Q5_1.gguf` | `molbal/krea2-gguf` | `models/unet/` | 9,9 GB |
| `qwen3vl_4b_fp8_scaled.safetensors` | `Comfy-Org/Krea-2` (`text_encoders/`) | `models/text_encoders/` | ~5 GB (estimado) |
| `qwen_image_vae.safetensors` | `Comfy-Org/Krea-2` (`vae/`) | `models/vae/` | <1 GB |

- Q5_1 é o ponto certo para 16 GB (o autor diz que Q5_0+ fica muito perto do BF16). Q8_0 (13,6 GB)
  mais o encoder não cabe inteiro na VRAM.
- Os GGUF do molbal são quantizações não-K, feitas para desquantização em PyTorch puro. Bom para
  AMD: os kernels acelerados de K-quant do fork são Triton/CUDA.
- Requer ComfyUI ≥ 0.27.0 e o fork `molbal/ComfyUI-GGUF` (o `city96/ComfyUI-GGUF` original não
  carrega esses arquivos, segundo o autor em 2026-06-24). Carregador: "Unet Loader (GGUF)";
  encoder via CLIPLoader com tipo `krea2`.
- RDNA3 não calcula FP8 nativo; o ComfyUI converte na carga. Funciona, só não ganha velocidade.
- Licença: "Krea 2 Community License". Não consegui ler o texto (link 404). Verificar uso
  comercial no model card `krea/Krea-2-Turbo` antes de usar arte gerada no jogo.

### 3.2 Vídeo: MiniMax H3 quantizado (não recomendado como principal)

O que é: transformer de 33B que gera vídeo com áudio estéreo sincronizado, 4–15 s, 24 fps,
base 768p. Variantes: `FL2VA` (texto, primeiro/último quadro) e `Ref2VA` (até 9 imagens,
3 vídeos, 3 áudios de referência). Suporte nativo no ComfyUI ≥ 0.30.0 (template
"Video > MiniMax H3"); GGUF via `ComfyUI-GGUF`.

Por que não serve bem a esta máquina:

1. **Encoder de texto gigante**: Qwen3-VL-32B. O menor GGUF (`Q2_K_M`) tem 12,2 GiB, sozinho
   quase a VRAM inteira. Com o DiT, há offload certo, e o PCIe 3.0 pune isso.
2. **RAM**: o guia prático cita 32 GB de RAM como piso; a máquina tem 31 GB.
3. **Velocidade**: numa RTX 3060 12 GB, "minutos por segundo de vídeo". RTX 5090 em Q5_1:
   ~10 min por 10 s. Nenhum relato em AMD/ROCm.
4. **Armadilha K-quant**: largura interna 2688 não é múltipla de 256; arquivos "Q4_K" de alguns
   repositórios são na prática Q4_0/Q4_1 com o mesmo tamanho.
5. **Licença**: "MiniMax H3 Community License"; um blog cita restrição de uso local em EUA, UE,
   Reino Unido e Coreia do Sul (não confirmado no texto oficial).

Se quiser testar mesmo assim (experimento, ~30 GB de disco):

| Arquivo | Origem | Tamanho |
|---|---|---|
| DiT FL2VA podado `UD-Q2_K_XL` ou `Q3_K` | `unsloth/MiniMax-H3-GGUF` | 7,5–8,2 GiB |
| Encoder `qwen3vl_32b_minimax_h3-Q2_K_M.gguf` | `unsloth/MiniMax-H3-GGUF` | 12,2 GiB |
| VAE de vídeo + VAE de áudio | `Comfy-Org/MiniMax-H3` | ~5,8 GB |
| LoRA turbo `minimax_h3_turbo_v4_step600_ema.safetensors` | `larryvrh/MiniMax-H3-Turbo-Lora` | pequeno |

Config: 864×480, 121 quadros (5 s), LoRA turbo força 1.0, 6–8 passos, scheduler `simple`.

### 3.3 Vídeo: alternativa leve (recomendada)

**Wan 2.2 TI2V-5B** em GGUF: texto→vídeo e imagem→vídeo, 5B parâmetros, roda em 8 GB com GGUF,
licença Apache 2.0 (a mais livre). Sem áudio. Qualidade menor que LTX/H3, mas cabe inteiro na
VRAM desta placa, que é o que mais pesa aqui. Disco ≈ 10 GB com encoder UMT5 e VAE.

**Evitar LTX-2.5 22B**: há bug aberto exatamente nesta placa (RX 7600 XT, ComfyUI AMD):
travamento total do sistema na transição baixa→alta resolução
([Lightricks/LTX-2#325](https://github.com/Lightricks/LTX-2/issues/325)), fechado como
"not planned"; a Lightricks não suporta ROCm oficialmente.

### 3.4 Ranking de modelos de imagem abertos (2026-11-25)

Fonte principal: Artificial Analysis, AA-Image-T2I v2.1, filtro open weights (Elo, voto humano às cegas).
Arena (arena.ai, 2026-11-21) concorda no topo: melhor modelo aberto = Qwen-Image-2.1.

| AA | Modelo | Elo | Parâm. | Licença dos pesos | Cabe nos 16 GB? |
|---|---|---|---|---|---|
| 1 | MiniMax H3-Image | 1066 | 33B | Comunitária, exclui EUA/UE/UK | Não (68 GB BF16; GGUF não confirmado) |
| 2 | Qwen-Image-2.1 | 1049 | 7B | Qwen Research (não comercial) | Sim, GGUF ~8–11 GB; precisa de nó GGUF próprio |
| 3 | **FLUX 3 Image Klein** | 1040 | 5,6B | FLUX Kommunity: comercial grátis abaixo de US$ 5 mi/ano | **Sim, inteiro (BF16 11,1 GB; GGUF Q8_0 6,1 GB)** |
| 4 | Bria Fibo 2.0 | 1037 | 8B | CC BY-NC 4.0 (não comercial) | Provável com quantização; sem dado oficial |
| 5 | Ideogram 4.0 (Quality) | 1026 | 9,3B | Pesos não comerciais (fontes divergem) | Sim em FP8 (~13 GB); NF4 é só CUDA |
| 8 | FLUX.2 [dev] | 1000 | 32B | Não comercial | Só com GGUF pesado + offload |
| 19 | Z-Image Turbo | 937 | 6B | Apache 2.0 | Sim, folgado |
| — | Krea 2 Turbo | fora do top 20 AA; 8º aberto na Arena em ago/2026 | 12B | Krea 2 Community | Sim, GGUF Q5_1 |

Escolha para esta máquina: **FLUX 3 Image Klein**. É o 3º do ranking, o menor entre os cinco primeiros
e o único do topo com uso comercial liberado para o porte do projeto. Cabe inteiro na VRAM até em BF16,
então não sofre com o PCIe 3.0. Suporte nativo no ComfyUI (`image_model: flux3`, dtypes bf16/fp32).

Arquivos:
- DiT: `unsloth/flux-3-image-klein-GGUF` → `flux-3-image-klein-Q8_0.gguf` (6,1 GB, sem gate), ou
  `black-forest-labs/flux-3-image-klein-comfy` → `flux3-image-klein-bf16.safetensors` (11,1 GB, gated).
  Evitar `int8-convrot` e `nvfp4`: são formatos com kernels NVIDIA.
- Encoder: `qwen3vl_4b_bf16.safetensors` ou `qwen3vl_4b_int8_convrot.safetensors` (repo BFL comfy).
  Testar antes se o `qwen3vl_4b_fp8_scaled` do Krea 2 serve (mesmo Qwen3-VL-4B), economiza 5–9 GB.
- VAE: `flux2-vae.safetensors` (0,34 GB).
- Upsampler de prompt Qwen3.5-9B: opcional, o Claude já faz esse papel.

Arquivos escolhidos para Qwen-Image-2.1 (instalação de 2026-11-25): `unsloth/Qwen-Image-2.1-Turbo-GGUF`
→ `qwen-image-2.1-turbo-Q8_0.gguf` (7,6 GB; 8 passos, CFG 1, euler/simple), encoder
`unsloth/Qwen3-VL-8B-Instruct-GGUF` → `Qwen3-VL-8B-Instruct-UD-Q4_K_XL.gguf` (5,2 GB, carregado pelo
`CLIPLoaderGGUF` do fork molbal), VAE `Comfy-Org/Qwen-Image-2.1` → `qwen_image_2.1_vae_bf16.safetensors`.
VAE do FLUX 3 Klein: `Comfy-Org/flux2-dev` → `split_files/vae/flux2-vae.safetensors` (o repo da BFL é gated).

Segunda opção: Qwen-Image-2.1 para uso pessoal (melhor nota aberta, licença não comercial).
Z-Image Turbo continua útil como modelo rápido e 100% livre (Apache 2.0).

### 3.5 3D: Pixal3D e TRELLIS.2

Dois caminhos, verificados nos repositórios do Hugging Face em 2026-11-25:

**A. Nós nativos do ComfyUI (≥ 0.46, sem compilar nada).** `comfy_extras/nodes_trellis2.py` reimplementa
em PyTorch puro o que antes vinha de `cumesh`/`o_voxel`/`nvdiffrast`. Não há Q4 neste formato.

| Arquivo | Repo | Tamanho |
|---|---|---|
| `diffusion_models/trellis_2_bf16.safetensors` | `Comfy-Org/TRELLIS.2` | 10,3 GB |
| `diffusion_models/pixal3d_bf16.safetensors` (e `pixal3d_multiview_bf16`) | `Comfy-Org/Pixal3D` | 11,0 GB cada |
| `vae/trellis_2_shape_vae_bf16` + `trellis_2_texture_vae_bf16` (compartilhados) | ambos | 2,1 GB |
| `clip_vision/dino_v3_vit_l` (TRELLIS.2) / `dino_v3_L_naf_fp32` (Pixal3D) | cada um | 1,2 GB cada |

As variantes `int8_convrot` (5,3–5,6 GB) usam kernels pensados para NVIDIA; no ROCm não há garantia.

**B. GGUF Q4 (nós da comunidade `Aero-Ex/ComfyUI-Trellis2-GGUF`).** Q4 só existe no formato "dividido"
original (um arquivo por etapa: sparse, shape, texture, decoders):

| Repo | Q4_K_M por etapa | Conjunto Q4 completo |
|---|---|---|
| `Aero-Ex/Trellis2-GGUF` | 0,79 GB | ~5,5 GB com decoders e DINOv3 |
| `Aero-Ex/Pixal3D-GGUF` | 0,76–0,78 GB | ~5,5 GB com decoders |

Custo: esses nós dependem de 6 extensões nativas (CuMesh, FlexGEMM, nvdiffrast, nvdiffrec_render, o_voxel,
custom_rasterizer). No AMD é preciso compilá-las com patches HIP (`toastmanAu/trellis-2-rocm-comfyui`,
testado só em gfx1100, ~30 min, exige `--use-pytorch-cross-attention`) ou usar o fork
`0xra0/ComfyUI-Trellis2-GGUF` (branch `local-rocm`, testado em gfx1030). Nenhum foi testado em gfx1102.

**Vídeo do canal PixelArtistry (2026-11-22, "New Best Local 3D AI Runs Now on 6GB Vram!").** A legenda
não baixou (YouTube devolveu HTTP 429). Pela descrição: os 6 GB valem para o **Hi3D 1.0**, um *refinador*
que reconstrói malhas brutas do TRELLIS.2/Pixal3D, usando os nós de 6 GB do AeroX. Requisito declarado:
Windows + NVIDIA, ComfyUI ≥ 0.42; testado numa RTX 5080 16 GB. Não confirma Pixal3D em 6 GB nem AMD.

### 3.6 Medições reais nesta máquina (2026-11-25, ComfyUI 0.46.0, 1024×1024)

Instalado em `~/ai/ComfyUI`; workflows de API em `~/ai/workflows/`. Iniciar com:

```bash
cd ~/ai/ComfyUI && ~/warpoly/tools/safe-run.sh --mem 20G --timeout 3600 -- \
  .venv/bin/python main.py --listen 127.0.0.1 --port 8188 --use-pytorch-cross-attention
```

| Modelo | Arquivos | Passos | Tempo/imagem (aquecido) | 1ª imagem (carga) | Workflow |
|---|---|---|---|---|---|
| FLUX 3 Klein Q8_0 | DiT 6,1 GB + encoder do Krea 2 (`qwen3vl_4b_fp8_scaled`, tipo `flux3`) + `flux2-vae` | 15, `er_sde` | **38 s** (2,3 s/it) | 86 s | `flux3_klein_gguf_t2i_api.json` |
| Qwen-Image-2.1 Turbo Q8_0 | DiT 7,6 GB + `Qwen3-VL-8B` UD-Q4_K_XL GGUF + VAE 2.1 | 8, sigmas manuais | **36 s** (2,9 s/it) | 42 s | `qwen_image21_turbo_gguf_t2i_api.json` |
| Krea 2 Turbo Q5_1 | DiT 10,7 GB + `qwen3vl_4b_fp8_scaled` | 8, euler | 60 s (7,3 s/it) | 192 s | `krea2_turbo_gguf_t2i_api.json` |

Notas:
- `--use-pytorch-cross-attention` (SDPA) deu ~8% a mais que o padrão (sub-quadratic).
- GPU detectada nativamente como `gfx1102`; `HSA_OVERRIDE_GFX_VERSION` não é necessário.
- O `comfy_kitchen` tem backend HIP com `int8_convrot`: os arquivos `*_int8_convrot` da Comfy-Org devem
  rodar no AMD (não testado).
- Qwen-Image-2.1: o `VAEDecode` comum estoura a VRAM (cache KV do `QwenImage21Cache` fica na GPU); usar
  `VAEDecodeTiled` (tile 512).
- O FLUX 3 Klein aceita o mesmo encoder do Krea 2, sem baixar o `qwen3vl_4b` da BFL.
- O Krea 2 seguiu melhor o estilo "low-poly"; o Qwen-Image-2.1 puxou para fotorrealismo com o mesmo prompt.

### 3.7 3D medido: Pixal3D e TRELLIS.2 int8_convrot (2026-11-25)

Template nativo `3d_pixal3d_trellis2_image_to_model`, convertido para API em
`~/ai/workflows/pixal3d_trellis2_i2m_api.json` (nó `316` = `false` Pixal3D, `true` TRELLIS.2).
Arquivos extras exigidos pelo template: `Comfy-Org/MoGe` → `geometry_estimation/moge_2_vitl_normal_fp16`,
`Comfy-Org/BiRefNet` → `background_removal/birefnet`. Os dois modelos usam `dino_v3_L_naf_fp32`;
o `dino_v3_vit_l` baixado não é usado pelo template.

| Modelo | Ajustes | Tempo | Pico VRAM | Saída |
|---|---|---|---|---|
| Pixal3D int8 | upsample 1536, decimar para 200 mil faces, atlas UV 2048 | 11,7 min | 15,9 GB | GLB 19 MB, 127 mil vért., PBR (cor, metal/rug., normal, AO) |
| TRELLIS.2 int8 | upsample **1024**, remesh **512**, 200 mil faces, atlas 2048 | 4,9 min | 12,5 GB | GLB 21 MB |

Problemas achados e soluções:
- **`UnwrapMesh` falha no ROCm** com `HIPBLAS_STATUS_ALLOC_FAILED` em `hipblasDgetrfBatched`: o
  `torch.linalg.solve` em lote fp64 quebra em gfx1102 acima de ~128×128 (reproduzido fora do ComfyUI;
  `TORCH_LINALG_PREFER_CUSOLVER=1` e lotes menores não resolvem). Correção:
  `custom_nodes/rocm_linalg_fix.py` manda esse caso para a CPU (~1 s).
- **Valores do template (700 mil faces, atlas 4096)** estouram a VRAM no unwrap: usar 200 mil e 2048.
- **TRELLIS.2 com upsample 1536** gera malha bruta de 16,6 milhões de faces; o `RemeshMesh` passou de 22 GB
  de RAM e o `safe-run` matou o processo (OOM controlado, máquina ok). Com 1024 a malha bruta tem 7,7 milhões.
- Pixal3D seguiu melhor a imagem de entrada; TRELLIS.2 é 2,4× mais rápido. Renders de conferência
  (Blender headless, `~/ai/workflows/render_glb.py`) em `~/ai/ComfyUI/output/3d/render_*.png`.

## 4. MCP e skills para o Claude Code

**Recomendado: MCP oficial `comfy-mcp`** (Comfy-Org, Python, beta, 42 ferramentas). Local, sem
conta nem chave. Gera imagem/vídeo, roda e valida workflows JSON, acompanha a fila, busca
templates/nós/modelos, sobe/para o ComfyUI e lê VRAM livre.

```bash
uv tool install comfy-mcp
uv tool install "comfy-cli>=1.14.0"
claude mcp add comfy-mcp -e COMFYUI_URL=http://127.0.0.1:8188 -- comfy-mcp
```

(O README usa `pip install`; `uv tool` isola num venv próprio, mais limpo. `COMFY_API_KEY` só
para modelos pagos de parceiros: não usar.)

**Alternativa mais pesada: `artokun/comfyui-mcp`** (comunidade, Node 22+, plugin Claude Code com
comandos `/comfy:gen`, 4 skills, 3 agentes, hooks de checagem de VRAM, download de modelos de
HuggingFace/Civitai). Mais recursos, mais peso e mais superfície (instala nós e apaga modelos).
Só se o oficial faltar algo.

**Skills**: a Comfy-Org cita um repositório `Comfy-Org/comfy-skills` (não verificado). Melhor
começar com uma skill própria pequena: workflows JSON salvos (Krea 2 Turbo, Wan 5B), presets de
resolução e a regra de usar `tools/safe-run.sh` no WarPoly.

## 5. Plano sugerido e orçamento de disco

| Fase | O quê | Disco |
|---|---|---|
| 1 | ComfyUI + torch ROCm + `molbal/ComfyUI-GGUF` + `comfy-mcp` | ~12 GB |
| 2 | Krea 2 Turbo Q5_1 + encoder + VAE; testar imagem pelo Claude | ~15 GB |
| 3 | Wan 2.2 TI2V-5B GGUF; testar vídeo curto (480p, 3–5 s) | ~10 GB |
| 4 (opcional) | MiniMax H3 Q2/Q3 podado como experimento | ~30 GB |

Fases 1–3: ~37 GB. Com a fase 4: ~67 GB (sobram ~39 GB).

Regra da máquina (CLAUDE.md): o ComfyUI é processo pesado. Rodá-lo junto com Playwright/Blender
arrisca OOM. Ou sobe via `tools/safe-run.sh --mem 12G` (ocupa a trava global enquanto roda), ou
só roda com os testes do WarPoly parados.

## 6. Pontos não verificados

- Licença do Krea 2 (uso comercial).
- Se o `city96/ComfyUI-GGUF` já incorporou o Krea 2 (evitaria o fork).
- Se o fork molbal carrega o H3 (os dois nós não convivem; testar antes da fase 4).
- Tempos reais nesta placa: nenhuma fonte mede RX 7600 XT. Medir na fase 2/3.

## Fontes

- ComfyUI, instalação: https://github.com/Comfy-Org/ComfyUI/blob/master/docs/installation.md
- Comfy MCP: https://comfy.org/mcp/ e https://github.com/Comfy-Org/comfy-mcp
- artokun/comfyui-mcp: https://github.com/artokun/comfyui-mcp
- Krea 2 GGUF: https://huggingface.co/molbal/krea2-gguf, https://github.com/molbal/ComfyUI-GGUF,
  https://www.kombitz.com/2026/06/26/how-to-use-krea-2-turbo-gguf-workflow-in-comfyui/
- MiniMax H3: https://huggingface.co/vantagewithai/MiniMax-H3-comfyUI-GGUF,
  https://comfyui-wiki.com/en/news/2026-08-10-unsloth-minimax-h3-gguf,
  https://runaihome.com/blog/minimax-h3-comfyui-gguf-workflow-tutorial-2026/
- Vídeo leve: https://ltxworkflow.com/blog/ltx-2-3-vs-hunyuanvideo-vs-wan2-2-comparison-2026,
  https://insiderllm.com/guides/local-ai-video-generation/
- Bug LTX na RX 7600 XT: https://github.com/Lightricks/LTX-2/issues/325
