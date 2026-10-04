import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function localBackupPlugin() {
  return {
    name: 'vite-plugin-local-backup',
    configureServer(server) {
      server.middlewares.use('/api/save-backup', (req, res, next) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const timestamp = new Date().toISOString().split('T')[0];
              const backupDir = path.resolve(__dirname, 'backups');
              
              if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir);
              }
              
              const filePath = path.join(backupDir, `job-command-center-backup-${timestamp}.json`);
              fs.writeFileSync(filePath, body);
              
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, path: filePath }));
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), localBackupPlugin()],
  server: {
    port: 3000,
    open: true,
  },
});
