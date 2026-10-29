// PM2 process for the API, the same way bargah runs on this host (Bun directly, reads .env from the repo root).
//
//   pm2 start ecosystem.config.cjs && pm2 save
//   pm2 logs api.assisteai.com.br

const os = require('os');
const path = require('path');

const BUN = process.env.BUN_PATH || path.join(os.homedir(), '.bun/bin/bun');

module.exports = {
  apps: [
    {
      name: 'api.assisteai.com.br',
      cwd: __dirname,
      script: BUN,
      args: 'run src/index.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000, // a crash-looping app waits 3 s between restarts
      kill_timeout: 10000, // time to finish in-flight requests after SIGINT
    },
  ],
};
