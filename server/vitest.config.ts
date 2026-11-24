import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Os arquivos de teste compartilham o mesmo banco; rodar em paralelo causava falhas intermitentes.
    fileParallelism: false,
    testTimeout: 45000,
    hookTimeout: 45000,
  },
});
