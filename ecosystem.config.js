module.exports = {
  apps: [
        {
          name: 'sora-feed-scanner',
          script: 'src/scanner.js',
      cwd: '/home/hendo420/soraFeed',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: './logs/scanner-error.log',
      out_file: './logs/scanner-out.log',
      log_file: './logs/scanner-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ],

  deploy: {
    production: {
      user: 'hendo420',
      host: 'localhost',
      ref: 'origin/scanner',
      repo: 'https://github.com/fourtytwo42/soraFeed.git',
      path: '/home/hendo420/soraFeed',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
