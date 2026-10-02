import { describe, it, expect } from 'vitest';
import { AlertCenter, ALERT_KINDS, PING_LIFE, RING_SIZE, CYCLE_WINDOW } from '../../src/ui/alerts.js';

const make = () => {
  const shown = [];
  let t = 100;
  const ac = new AlertCenter({ onShow: (a) => shown.push(a), clock: () => t });
  return { ac, shown, at: (s) => { t = s; return s; } };
};

describe('AlertCenter (F6-05)', () => {
  it('mostra cada tipo com o texto PT-BR e a severidade esperados', () => {
    const { ac, shown } = make();
    ac.raise('attack', { pos: { x: 1, z: 1 } });
    ac.raise('depleted', { pos: { x: 50, z: 50 } });
    ac.raise('research', { text: 'Pesquisa concluída: Armadura 1/3' });
    ac.raise('built', { text: 'Construção concluída: Quartel' });
    ac.raise('food');
    expect(shown.map((a) => a.text)).toEqual([
      'Estamos sob ataque!', 'Mina esgotada', 'Pesquisa concluída: Armadura 1/3', 'Construção concluída: Quartel', 'Não há comida suficiente'
    ]);
    expect(shown.map((a) => a.severity)).toEqual(['danger', 'warn', 'good', 'good', 'warn']);
    expect(ac.raise('inexistente').shown).toBe(false);
  });

  it('20 danos seguidos no mesmo lugar em 2 s geram 1 alerta de ataque', () => {
    const { ac, shown, at } = make();
    for (let i = 0; i < 20; i++) ac.raise('attack', { pos: { x: 10 + (i % 3), z: 5 }, now: at(100 + i * 0.1) });
    expect(shown).toHaveLength(1);
    expect(ac.pings).toHaveLength(1);
  });

  it('ataque longe do anterior (> raio) gera novo alerta, mesmo dentro da recarga', () => {
    const { ac, shown } = make();
    ac.raise('attack', { pos: { x: 0, z: 0 }, now: 100 });
    ac.raise('attack', { pos: { x: 60, z: 0 }, now: 101 });
    expect(shown).toHaveLength(2);
  });

  it('depois da recarga o mesmo ataque alerta de novo', () => {
    const { ac, shown } = make();
    ac.raise('attack', { pos: { x: 0, z: 0 }, now: 100 });
    ac.raise('attack', { pos: { x: 1, z: 0 }, now: 100 + ALERT_KINDS.attack.cooldown - 0.1 });
    expect(shown).toHaveLength(1);
    ac.raise('attack', { pos: { x: 1, z: 0 }, now: 100 + ALERT_KINDS.attack.cooldown + 0.1 });
    expect(shown).toHaveLength(2);
  });

  it('comida: recarga de 4 s; pesquisa nunca é suprimida; construção só se repetir no mesmo ponto em 1,5 s (muralhas)', () => {
    const { ac, shown } = make();
    ac.raise('food', { now: 10 }); ac.raise('food', { now: 12 }); ac.raise('food', { now: 14.5 });
    expect(shown.filter((a) => a.kind === 'food')).toHaveLength(2);
    ac.raise('research', { now: 20 }); ac.raise('research', { now: 20 });
    expect(shown.filter((a) => a.kind === 'research')).toHaveLength(2);
    ac.raise('built', { pos: { x: 0, z: 0 }, now: 30 });
    ac.raise('built', { pos: { x: 2, z: 0 }, now: 30.5 });   // segmento de muralha ao lado: suprimido
    ac.raise('built', { pos: { x: 50, z: 0 }, now: 30.6 });  // outra construção: alerta
    ac.raise('built', { pos: { x: 0, z: 0 }, now: 32 });     // passou a recarga: alerta
    expect(shown.filter((a) => a.kind === 'built')).toHaveLength(3);
  });

  it('supressão atualiza a posição: o Espaço vai ao ponto mais novo', () => {
    const { ac } = make();
    ac.raise('attack', { pos: { x: 0, z: 0 }, now: 100 });
    ac.raise('attack', { pos: { x: 8, z: 3 }, now: 101 });
    expect(ac.jump(110).pos).toEqual({ x: 8, z: 3 });
  });

  it('anel de alertas limitado a RING_SIZE; alertas sem posição ficam fora do Espaço', () => {
    const { ac } = make();
    for (let i = 0; i < 12; i++) ac.raise('depleted', { pos: { x: i * 100, z: 0 }, now: 100 + i * 5 });
    ac.raise('food', { now: 200 });
    expect(ac.ring).toHaveLength(RING_SIZE);
    expect(ac.ring[0].pos.x).toBe(1100);
    expect(ac.ring.every((a) => a.pos)).toBe(true);
  });

  it('Espaço: novo → anteriores (toques em ≤ janela) → volta; fora da janela recomeça no mais novo', () => {
    const { ac } = make();
    ac.raise('depleted', { pos: { x: 1, z: 0 }, now: 100 });
    ac.raise('attack', { pos: { x: 2, z: 0 }, now: 101 });
    ac.raise('depleted', { pos: { x: 300, z: 0 }, now: 102 });
    const seq = [200, 201, 202, 203].map((t) => ac.jump(t).pos.x);
    expect(seq).toEqual([300, 2, 1, 300]);
    expect(ac.jump(200 + 3 + CYCLE_WINDOW + 1).pos.x).toBe(300);
    expect(new AlertCenter().jump()).toBeNull();
  });

  it('pings: só tipos com ping, vivem 4 s e expiram', () => {
    const { ac } = make();
    ac.raise('attack', { pos: { x: 5, z: 5 }, now: 100 });
    ac.raise('built', { pos: { x: 9, z: 9 }, now: 100 });
    ac.raise('food', { now: 100 });
    ac.raise('research', { pos: { x: 3, z: 3 }, now: 100 });
    expect(ac.activePings(101)).toHaveLength(1);
    expect(ac.activePings(100 + PING_LIFE / 2)[0].age).toBeCloseTo(0.5);
    expect(ac.activePings(100 + PING_LIFE + 0.01)).toHaveLength(0);
  });

  it('posição inválida é ignorada (alerta sem ping)', () => {
    const { ac, shown } = make();
    ac.raise('attack', { pos: { x: NaN, z: 1 } });
    expect(shown).toHaveLength(1);
    expect(ac.pings).toHaveLength(0);
    expect(shown[0].pos).toBeNull();
  });
});
