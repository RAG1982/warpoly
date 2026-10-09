import { it, expect } from 'vitest';
import fs from 'fs';
import { validateMission } from '../../src/sim/missions/schema.js';

const dir = 'src/data/campaigns/alliance/';
it('valida', () => {
  for (const f of fs.readdirSync(dir).filter((x) => /^m\d+.*\.json$/.test(x))) {
    const r = validateMission(JSON.parse(fs.readFileSync(dir + f, 'utf8')));
    expect(r.errors, f).toEqual([]);
  }
});
