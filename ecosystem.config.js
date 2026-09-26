/**
 * PM2 Ecosystem Configuration
 * Dùng khi triển khai ứng dụng trên server Linux / VPS bằng PM2:
 * 
 * Lệnh chạy:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "zalo-chatbot",
      script: "dist/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
