import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import { agentApiPlugin } from './src/agent-server.js';
export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [agentApiPlugin({ apiKey: serverEnv.OPENAI_API_KEY, model: serverEnv.OPENAI_MODEL || 'gpt-6.2-sol' })],
    build: { rollupOptions: { input: {
      proposal: resolve(import.meta.dirname, 'index.html'),
      app: resolve(import.meta.dirname, 'app.html'),
    } } },
  };
});
