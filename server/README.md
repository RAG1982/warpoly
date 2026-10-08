# Servidor de sinalização WarPoly (F9-02)

Só sinalização + lobby; os comandos de jogo vão por WebRTC DataChannel entre os jogadores (lockstep, ver `docs/09_MULTIPLAYER.md`).

## Rodar
```
npm install            # traz `ws`
npm run signaling      # node server/index.js  (porta 8787; --port N / --host H / env PORT, HOST)
npx vite --port 5173   # abra http://localhost:5173/lobby.html em duas abas
```
Dependência única: [`ws`](https://github.com/websockets/ws) (WebSocket maduro, sem dependências transitivas; implementar o handshake/frames à mão não compensa).

## Protocolo (JSON, `{t:...}`; validação estrita em `protocol.js`)
Cliente -> servidor: `create{name,public?,maxPlayers?,config?}`, `join{code,name}`, `leave`, `list`, `ready{ready}`, `setup{faction?,color?,team?}`, `config{config}` (anfitrião), `kick{id}` (anfitrião), `start` (anfitrião; exige todos prontos e >= 2), `chat{text}`, `signal{to,data}` (offer/answer/ice), `ping`.
Servidor -> cliente: `hello`, `joined`, `room` (snapshot), `rooms`, `peer-joined`, `peer-left`, `signal{from,data}`, `chat`, `start{config,players,seed,startAt}`, `kicked`, `error{code}`, `pong`.

## Limites
8 jogadores/sala; mensagem <= 16 KiB (binário recusado); token bucket 30 + 15/s por conexão; 5 violações => fecha (1008); inatividade 60 s sem mensagem/pong => fecha (4000); 500 salas; 20 conexões por IP; códigos de 5 caracteres (sem ambíguos). Se o anfitrião sai, o menor id assume.

## Deploy
- VM/container: `node server/index.js` atrás de proxy TLS (nginx/Caddy) para `wss://`; páginas em HTTPS exigem `wss://`. Atrás de proxy, o limite por IP usa o IP do proxy: ajuste `maxConnsPerIp` ou repasse `X-Forwarded-For`.
- Alternativa documentada: **Cloudflare Worker + Durable Object** (um DO por sala, WebSocket Hibernation API). Mantém o mesmo protocolo: o DO guarda `members`/`host`/`config` e reimplementa `handle()` de `signaling.js`; a lista pública pode ficar num DO "diretório". Não implementado nesta tarefa.
- NAT simétrico: configure TURN em `WebRTCTransport({ rtcConfig: { iceServers: [...] } })`; sem TURN ~10-15 % das conexões falham.
