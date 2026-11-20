import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import { agentApiPlugin } from './src/agent-server.js';
export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), '');
  return {
    base: mode === 'production' ? '/Agent-Factory/' : '/',
    plugins: [agentApiPlugin({ apiKey: serverEnv.OPENAI_API_KEY, model: serverEnv.OPENAI_MODEL || 'gpt-6.2-sol' })],
    build: { rollupOptions: { input: {
      index: resolve(import.meta.dirname, 'index.html'),
      app: resolve(import.meta.dirname, 'app.html'),
      proposal: resolve(import.meta.dirname, 'factory-agent-proposal.html'),
    } } },
  };
});
