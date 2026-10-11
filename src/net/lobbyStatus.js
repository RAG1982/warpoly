/**
 * lobbyStatus.js — NEW-50: mensagens de erro do lobby e quando limpá-las.
 * Separado do `lobby.js` (que depende do DOM) para ser testável em Node.
 */
export const ERR = {
  'no-such-room': 'Sala não encontrada.',
  'room-full': 'Sala cheia.',
  'already-started': 'A partida já começou.',
  'not-host': 'Só o anfitrião pode fazer isso.',
  'need-players': 'São necessários pelo menos 2 jogadores.',
  'not-all-ready': 'Nem todos estão prontos.',
  'rate-limited': 'Muitas mensagens; devagar.',
  'server-full': 'Servidor cheio.'
};

/** Liga ao cliente de sinalização: erro mostra aviso; `room`/`start` limpam o aviso anterior. */
export function bindStatus(sig, setStatus) {
  sig.on('error', (m) => setStatus(ERR[m.code] || `Erro: ${m.code}`));
  sig.on('room', () => setStatus(''));
  sig.on('start', () => setStatus(''));
}
