import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

function localApiPlugin() {
  return {
    name: 'vite-plugin-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // 1. Backup Endpoint
        if (req.url === '/api/save-backup' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const timestamp = new Date().toISOString().split('T')[0];
              const backupDir = path.resolve(__dirname, 'backups');
              if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
              
              const filePath = path.join(backupDir, `job-command-center-backup-${timestamp}.json`);
              fs.writeFileSync(filePath, body);
              
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, path: filePath }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        // 2. Python Bot Trigger Endpoint
        if (req.url === '/api/run-python-bot' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const { botType, config } = JSON.parse(body);
              const scriptName = botType === 'easy_apply' ? 'easy_apply_bot.py' : 'external_job_collector.py';
              
              // Setup paths for the Python project
              const linkedInDir = path.resolve(__dirname, '../linkedin-auto-apply');
              const venvPython = path.resolve(linkedInDir, '../venv/Scripts/python.exe');
              const configPath = path.join(linkedInDir, 'config.json');
              
              if (!fs.existsSync(linkedInDir)) {
                 throw new Error(`Python project directory not found at ${linkedInDir}`);
              }
              
              // Merge UI settings into python config
              let fullConfig = {};
              if (fs.existsSync(configPath)) {
                 fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              }
              fullConfig.search_parameters = config.search_parameters || fullConfig.search_parameters;
              fullConfig.bot_settings = { ...fullConfig.bot_settings, ...config.bot_settings };
              
              // Write the updated config for the Python bot to consume
              fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));

              // Run the python script
              exec(`"${venvPython}" ${scriptName}`, { cwd: linkedInDir }, (error, stdout, stderr) => {
                 if (error) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: error.message, stderr, stdout }));
                    return;
                 }
                 
                 // Fetch the generated CSV
                 const csvFile = botType === 'easy_apply' ? 'applications_tracker.csv' : 'external_jobs.csv';
                 const csvPath = path.join(linkedInDir, csvFile);
                 let csvData = "";
                 if (fs.existsSync(csvPath)) {
                    csvData = fs.readFileSync(csvPath, 'utf8');
                 }
                 
                 res.statusCode = 200;
                 res.setHeader('Content-Type', 'application/json');
                 res.end(JSON.stringify({ success: true, stdout, csvData }));
              });
              
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    port: 3000,
    open: true,
  },
});
