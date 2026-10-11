// Node >= 21 define `navigator.language` ('en-US'); o i18n detecta o idioma por ele e os testes de UI/mensagens
// esperam pt-BR (idioma padrão do jogo). Fixa o idioma do ambiente de testes; testes de i18n que precisam de
// outro idioma passam `navLang`/`storage` a `createI18n`.
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
}
Object.defineProperty(globalThis.navigator, 'language', { value: 'pt-BR', configurable: true });
