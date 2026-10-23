# Plano de implementação do multiplayer (rumo ao 1.0)

Criado em 2026-10-23. Complementa `docs/PLANO_FINAL.md` (marco M6) e `docs/09_MULTIPLAYER.md` (desenho técnico). IDs `MP-nn` são novos; os `M6-xx` citados já existem no plano final.

## 1. Onde estamos

**Já feito e verificado (F9-01…F9-05):**
- Lockstep determinístico para até 8 jogadores (humanos + IA), atraso adaptativo por par, checksum a cada 1 s, relatório de desync.
- WebRTC full mesh (DataChannel), lobby (criar/entrar por código ou link, slots, facção, cor, time, pronto, expulsar), chat, pings de mapa, pausa votada, queda vira IA, retorno por snapshot, reenvio/NACK.
- Replays de partida online idênticos em todos os pares.
- Sinalizador Node + `ws` (`server/`, 268 linhas) com limites de abuso e `rejoin`.
- Testes: `lockstep*.test.js`, `signaling.test.js`, `webrtcTransport.test.js`, `replayOnline.test.js`; navegador: `tools/online-check.mjs` (2 Chromium, rede local).

**O que NÃO existe:**
1. O item **Multiplayer** do menu principal mostra a etiqueta "Em breve" (`MainMenu.js:312`); a entrada real é só por URL `/?online=1`.
2. O sinalizador só roda local (porta 8787); sem hospedagem, sem HTTPS/WSS, sem TURN.
3. Determinismo entre navegadores (`Math.sin/cos/atan2` na sim): hoje só garante Chromium × Chromium.
4. Nenhuma partida online foi validada depois das mudanças recentes de conteúdo (2 Centros, `UPGRADE_HQ`, heróis e magias, revide inteligente, novos modelos/mapas, renomeação de facções).
5. Sem teste com redes diferentes, NAT restritivo, Firefox/Safari.
6. Sem mensagem clara para versão incompatível entre jogadores (cache/PWA antigo).

## 2. Escopo do 1.0 (proposto)

**Dentro:** partida online 1v1 a 8 jogadores (com IA), escaramuça em qualquer mapa com vagas suficientes, lobby por código/link e lista pública, chat, pausa votada, reconexão, replays.
**Fora (pós-1.0):** campanha cooperativa online, espectadores ao vivo, matchmaking/ranking automático, servidor autoritativo/anti-maphack, TURN próprio, mobile.

## 3. Decisões que dependem de você

| ID | Pergunta | Recomendação | Impacto |
|---|---|---|---|
| **MP-D1** | **Onde hospedar o jogo (HTML/JS/modelos)?** O WSS exige página em HTTPS. | **Cloudflare Pages** (mesma conta do Worker, gratuito, deploy por `wrangler pages deploy dist`) | Sem isso o link de convite não existe. Bloqueia MP-06. |
| **MP-D2** | **TURN para quem tem NAT simétrico (~10–15 % das conexões)?** | (a) **1.0 sem TURN**, com mensagem clara e `docs` explicando; (b) Cloudflare Realtime TURN (plano gratuito generoso, exige chave na conta) entra se o teste G6 mostrar falhas | (a) custa 0; (b) +1 tarefa e um segredo no Worker |
| **MP-D3** | **Conta Cloudflare:** criar conta gratuita e rodar `npx wrangler login` (decisão D9 já tomada). | — | Bloqueia MP-05 em diante. |
| **MP-D4** | **Nome/domínio do jogo online:** `warpoly.<sua-conta>.workers.dev`/`.pages.dev` basta no 1.0? | Sim; domínio próprio depois | Só estética. |

Decidido por mim (sem consulta): anfitrião não é autoridade (já é assim); `protocolVersion` e `dataHash` exatos no handshake; Worker usa **Durable Object com backend SQLite** (exigência do plano gratuito) e **WebSocket Hibernation**; escaramuça online sem heróis (D7); salas públicas expiram sozinhas.

**Respostas do dono (2026-10-23):** MP-D1 = Cloudflare Pages; MP-D2 = sem TURN no 1.0 (reavaliar após MP-11); implementação por agentes **Haiku 5.5** (exceção pedida pelo dono à regra de que Haiku só faz tarefas mecânicas; o coordenador revisa cada merge com mais rigor).

## 4. Tarefas, em ordem de execução

Legenda: Dif. = dificuldade; Exec. S = agente Sonnet 5.5, V = você.

| ID | Tarefa | Dif. | Dep. | Exec. |
|---|---|---|---|---|
| **MP-01** | **Auditoria online do conteúdo novo.** Teste headless via `MemoryTransport` (2, 4 e 8 jogadores com IA) em escaramuça com: 2 Centros + `UPGRADE_HQ`, heróis/magias da IA, revide inteligente, naval/aéreo, 3 mapas de cada tipo. Meta: 0 desync em ≥ 30 partidas de 15 min de jogo. Corrige o que divergir (a causa quase sempre é estado fora do checksum ou iteração sem ordem estável). | Média | — | S |
| **MP-02** | **Menu Multiplayer de verdade:** tirar "Em breve", abrir `OnlineLobby` direto do menu (nome do jogador, criar sala, entrar por código, lista de salas públicas), com PT-BR e visual igual ao resto do menu. Esc volta. A URL `?online=1` continua funcionando. | Média | M2-34 (padrão visual) | S |
| **MP-03** | **Versão incompatível e erros de rede com texto claro:** handshake que mostra "outro jogador usa outra versão; recarregue a página" (com botão), "sua rede não permite conexão direta" quando o ICE falha, "servidor indisponível, tentando de novo". Integra com a atualização do PWA (limpar cache/recarregar). | Média | MP-02 | S |
| **MP-04** | **Determinismo entre navegadores = M6-01** (`src/sim/fmath.js`, vigia `noMathTrig.test.js`). Já planejada; **sobe de prioridade** porque sem ela só dois Chromium jogam juntos. | Difícil | MP-01 | S |
| **MP-05** | **Sinalizador na Cloudflare = M6-03:** extrair a lógica de sala para `server/core/`, Worker + Durable Object por sala (Hibernation), DO diretório para salas públicas, `wrangler.toml`, `docs/10_DEPLOY.md`, URL configurável no cliente, mesmos limites do servidor Node. O servidor Node local continua funcionando. | Difícil | MP-04, MP-D3 | S + V (login) |
| **MP-06** | **Publicar o jogo em HTTPS (MP-D1):** `npm run build` + Cloudflare Pages, `BASE` e URL do sinalizador de produção, cabeçalhos de cache coerentes com o PWA, link de convite `https://…/?online=1&sala=CODIGO`. | Média | MP-05, MP-D1 | S + V |
| **MP-07** | **Teste online ponta a ponta contra o servidor hospedado:** `tools/online-check.mjs --remote <url>`: 2 contextos, sala, 5 min, comandos cruzados, 0 desync, queda e retorno. Mais um teste de carga leve no Worker (20 salas simultâneas). | Média | MP-06 | S |
| **MP-08** | **Compatibilidade de navegador:** Firefox e Safari (WebRTC DataChannel, `BroadcastChannel`, IndexedDB); partida Chromium × Firefox sem desync (depende de MP-04). Entra junto da **M6-04**. | Média | MP-04, MP-07 | S + V |
| **MP-09** | **Robustez de produção:** reconexão do WebSocket com backoff, limpeza de salas órfãs, limites por IP no Worker, telemetria mínima de erros de conexão (só contagem local no console/relatório; nada de dados pessoais). | Média | MP-05 | S |
| **MP-10** | **Documentação:** `docs/09_MULTIPLAYER.md` atualizado (§4 determinismo, §5 hospedagem), guia do jogador "como jogar online" (código/link, rede, o que fazer se não conectar), guia de deploy. Junta com **M6-07**. | Fácil | MP-08 | S |
| **MP-11** | **G6 online — sua passada:** partida de 15 min com outra pessoa em outra rede; teste com celular em 4G como ponto de acesso (NAT difícil); uma queda e um retorno; Firefox se possível. Resultado decide MP-D2 (TURN). | — | MP-10 | V |

**Paralelismo:** MP-01, MP-02 e MP-04 podem rodar juntas (3 agentes; só um processo pesado por vez). MP-05 só começa depois do MP-04 (mexe em `server/`, que o MP-04 não toca, mas o teste de partida precisa da sim estável).

**Se o G6 mostrar falhas de conexão (> 10 %):** abre **MP-12** (TURN via Cloudflare Realtime, chave guardada como segredo do Worker, nunca no cliente em texto claro; credenciais temporárias emitidas pelo Worker).

## 5. Critério de pronto do multiplayer 1.0

1. 0 desync em 30 partidas headless variadas (MP-01) e em 5 min reais entre dois navegadores diferentes (MP-08).
2. Menu → Multiplayer → criar sala → copiar link → outra pessoa abre e joga, sem digitar URL técnica.
3. Duas máquinas em redes diferentes jogam 15 min (MP-11).
4. Versão diferente, rede bloqueada ou servidor fora do ar geram mensagem útil, nunca tela travada.
5. Servidor Node local e Worker passam nos mesmos testes de protocolo.

## 6. Riscos

| Risco | Tratamento |
|---|---|
| Desync por conteúdo novo | MP-01 antes de tudo; relatório de desync já grava os últimos 100 turnos. |
| `sin/cos/atan2` divergem entre motores | MP-04; sem ele o 1.0 anuncia "online só em Chromium" (plano B documentado). |
| NAT simétrico impede conexão | Mensagem clara (MP-03); TURN só se o G6 provar necessidade (MP-12). |
| Limites do plano gratuito da Cloudflare | DO com SQLite + Hibernation (custo por conexão ociosa ≈ 0); sinalização usa poucos bytes; limites por IP no Worker (MP-09). |
| Jogador com versão antiga em cache | Handshake com `protocolVersion` + `dataHash` e botão de recarregar (MP-03). |
| Maphack (lockstep sem servidor) | Aceito no 1.0 e documentado; comandos são revalidados e desync revela adulteração. |
