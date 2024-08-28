import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Custom plugin to handle .txt files
const rawTextPlugin = () => {
  return {
    name: 'vite-plugin-raw-text',
    transform(src, id) {
      if (id.endsWith('.txt')) {
        const stringified = JSON.stringify(src);
        return {
          code: `export default ${stringified};`,
          map: null
        };
      }
    }
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), rawTextPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
