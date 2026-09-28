import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', '.claude/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    rules: {
      // Relaxado para o código atual passar sem reescrita em massa (F0-05).
      // Endurecer aos poucos conforme os arquivos forem refatorados.
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      // `catch (e) {}` é usado de propósito (warm-up de shaders, áudio, etc.).
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    // Configs, ferramentas e testes rodam em Node.
    files: ['*.config.js', 'tools/**/*.{js,mjs}', 'tests/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];
