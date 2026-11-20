import { defineConfig } from 'vite';
export default defineConfig(({mode})=>({
  base: './',
  define: {__RICEFLUX_AUDIENCE__:JSON.stringify(['researcher','breeder'].includes(mode)?mode:'combined')},
  build: { outDir: 'docs', rolldownOptions: { onwarn(warning, handle) {
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
    handle(warning);
  } } }
}));
