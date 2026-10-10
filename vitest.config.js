import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    // NEW-41: com ~100 arquivos em workers paralelos, testes síncronos pesados (WebGL stub,
    // campanha de 5 min simulados) estouravam os 5 s padrão sem estarem errados.
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
