#!/bin/bash
set -e

echo "=== 1. Xóa cấu hình Nginx cũ bị lỗi và trang mặc định ==="
sudo rm -f /etc/nginx/sites-available/zalobot
sudo rm -f /etc/nginx/sites-enabled/zalobot
sudo rm -f /etc/nginx/sites-enabled/default

echo "=== 2. Cài đặt Nginx & Certbot ==="
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

echo "=== 3. Tạo file cấu hình Nginx cho zalobot-thinh.duckdns.org ==="
sudo bash -c 'cat > /etc/nginx/sites-available/zalobot' << 'EOF'
server {
    listen 80;
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
EOF

sudo ln -sf /etc/nginx/sites-available/zalobot /etc/nginx/sites-enabled/

echo "=== 4. Kiểm tra cú pháp Nginx ==="
sudo nginx -t
sudo systemctl reload nginx

echo "=== 5. Cấp chứng chỉ SSL HTTPS qua Certbot ==="
sudo certbot --nginx -d zalobot-thinh.duckdns.org --non-interactive --agree-tos -m thinhnguyen42@gmail.com || true

echo "=== 6. Khởi động Chatbot bằng PM2 ==="
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
pm2 save

echo ""
echo "=========================================================="
echo "🎉 TẤT CẢ ĐÃ CÀI ĐẶT THÀNH CÔNG!"
echo "Truy cập kiểm tra: https://zalobot-thinh.duckdns.org/health"
echo "Webhook điền vào Zalo: https://zalobot-thinh.duckdns.org/webhook"
echo "=========================================================="
