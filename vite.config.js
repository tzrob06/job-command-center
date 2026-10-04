import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

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

        // 2. Scraper Endpoint
        if (req.url === '/api/scrape' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const { url, cookie, config } = JSON.parse(body);
              if (!url || !config || !config.selectors) {
                throw new Error("Missing url or selectors in config");
              }

              const fetchOptions = {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                  'Accept-Language': 'en-US,en;q=0.9',
                }
              };
              if (cookie) {
                fetchOptions.headers['Cookie'] = cookie;
              }

              const response = await fetch(url, fetchOptions);
              if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
              const html = await response.text();
              
              const $ = cheerio.load(html);
              const results = [];
              const { row, company, role, status } = config.selectors;

              $(row).each((i, el) => {
                const cName = $(el).find(company).text().trim().replace(/\n/g, ' ');
                const rTitle = $(el).find(role).text().trim().replace(/\n/g, ' ');
                
                // Optional keyword filtering logic
                let matchesKeyword = true;
                if (config.keywords && config.keywords.length > 0) {
                  const combined = (cName + " " + rTitle).toLowerCase();
                  matchesKeyword = config.keywords.some(k => combined.includes(k.toLowerCase()));
                }

                if (cName && rTitle && matchesKeyword) {
                  results.push({
                    company: cName,
                    role: rTitle,
                    status: status || 'Applied',
                    source: config.name || 'Scraped',
                    dateApplied: new Date().toISOString().split('T')[0]
                  });
                }
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, count: results.length, data: results }));
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
