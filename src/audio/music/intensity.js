/**
 * intensity.js — EVOLUÇÃO DA MÚSICA PELO TEMPO DE PARTIDA. Função PURA e determinística: converte `gameTime` (segundos de
 * simulação decorridos) em uma intensidade 0..1 que o `MusicPlayer` usa para (a) ligar camadas de percussão/metais/cordas,
 * (b) subir de registro e (c) acelerar o andamento em +2…6 % (`track.tempoGain`). A música de paz começa calma e ganha
 * urgência conforme os minutos passam, sem quebrar o laço (a posição da música continua sendo `passo % tamanho do laço`).
 *
 * Só lê um número que a apresentação já recebe (`gameTime`); nunca escreve na simulação e não usa relógio nem Math.random.
 */

/** Curva padrão: nada nos 2 primeiros minutos; intensidade máxima aos 20 min (suavizada, sem degraus). */
export const INTENSITY_RAMP = Object.freeze({ startSeconds: 120, fullSeconds: 1200 });

const clamp01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0);

/**
 * @param {number} gameSeconds  tempo de partida (s); inválido/negativo = 0
 * @param {{startSeconds:number, fullSeconds:number}} [ramp]
 * @returns {number} 0..1, não decrescente no tempo
 */
export function intensityFromGameTime(gameSeconds, ramp = INTENSITY_RAMP) {
  const t = Number(gameSeconds);
  if (!(t > 0)) return 0;
  const x = clamp01((t - ramp.startSeconds) / Math.max(1, ramp.fullSeconds - ramp.startSeconds));
  return x * x * (3 - 2 * x); // smoothstep
}

/** Arredonda a intensidade a passos de 1/16 (evita reprogramar camadas a cada quadro). */
export function quantizeIntensity(x) {
  return Math.round(clamp01(x) * 16) / 16;
}
