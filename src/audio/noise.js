/**
 * noise.js (F7-08) — geradores PUROS de ruído (preenchem um Float32Array) para os buffers compartilhados do motor:
 * ruído branco (percussão, fricção) e rosa (vento, água, estrondo). RNG de render injetado; nada de Math.random.
 */

/** Ruído branco uniforme em [-1, 1]. */
export function fillWhite(data, rng) {
  for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  return data;
}

/** Ruído rosa (≈ -3 dB/oitava; aproximação de Paul Kellet), normalizado para pico <= ~1. */
export function fillPink(data, rng) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return data;
}

/** Cria os buffers de ruído do motor (branco 2 s, rosa 4 s) num contexto de áudio. */
export function createNoiseBuffers(ctx, rng) {
  const sr = ctx.sampleRate;
  const white = ctx.createBuffer(1, Math.round(sr * 2), sr);
  fillWhite(white.getChannelData(0), rng);
  const pink = ctx.createBuffer(1, Math.round(sr * 4), sr);
  fillPink(pink.getChannelData(0), rng);
  return { white, pink };
}
