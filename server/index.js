#!/usr/bin/env node
/** CLI: `node server/index.js [--port 8787] [--host 0.0.0.0]` (ver server/README.md). */
import { createSignalingServer } from './signaling.js';

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 ? process.argv[i + 1] : d;
};
const s = createSignalingServer({ port: Number(arg('port', process.env.PORT || 8787)), host: arg('host', process.env.HOST || '0.0.0.0') });
await s.ready;
console.log(`[warpoly-signaling] ouvindo na porta ${s.port}`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => s.close().then(() => process.exit(0)));
