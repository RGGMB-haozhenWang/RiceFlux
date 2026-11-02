import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'docs', rolldownOptions: { onwarn(warning, handle) {
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
    handle(warning);
  } } }
});
