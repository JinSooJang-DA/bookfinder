import { defineConfig } from 'vite';

// npm run dev       → http  (PC)
// npm run dev:phone → https (Handy im WLAN; Kamera im Browser braucht https)
export default defineConfig(async ({ mode }) => {
  const plugins = [];
  if (mode === 'phone') {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl');
    plugins.push(basicSsl());
  }
  return { base: '/bookfinder/', plugins };
});
