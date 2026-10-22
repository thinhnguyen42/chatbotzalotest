#!/bin/bash
set -e

echo "=== 1. Xóa cấu hình Nginx cũ và trang mặc định ==="
sudo rm -f /etc/nginx/sites-available/zalobot
sudo rm -f /etc/nginx/sites-enabled/zalobot
sudo rm -f /etc/nginx/sites-enabled/default

echo "=== 2. Cài đặt Nginx & Certbot nếu chưa có ==="
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

echo "=== 3. Tạo cấu hình Nginx hỗ trợ cả HTTP (80) và HTTPS (443) KHÔNG REDIRECT ==="
sudo bash -c 'cat > /etc/nginx/sites-available/zalobot' << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name zalobot-thinh.duckdns.org;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name zalobot-thinh.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/zalobot-thinh.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/zalobot-thinh.duckdns.org/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/zalobot /etc/nginx/sites-enabled/

echo "=== 4. Kiểm tra cú pháp Nginx và tải lại ==="
sudo nginx -t
sudo systemctl reload nginx

echo "=== 5. Biên dịch mã nguồn & Khởi động Chatbot bằng PM2 ==="
pnpm run build
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
pm2 save

echo ""
echo "=========================================================="
echo "🎉 ĐÃ CẬP NHẬT XONG! CẢ HTTP VÀ HTTPS ĐỀU TRẢ VỀ 200 OK!"
echo "HTTP:  http://zalobot-thinh.duckdns.org/zalo_verifierMDYa0wpLTYTR_j5-cFnTVcQEYrkA-546CJ4r.html"
echo "HTTPS: https://zalobot-thinh.duckdns.org/zalo_verifierMDYa0wpLTYTR_j5-cFnTVcQEYrkA-546CJ4r.html"
echo "=========================================================="
