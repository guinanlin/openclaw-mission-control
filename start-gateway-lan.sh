#!/bin/bash
# 启动 OpenClaw Gateway LAN 模式
# 用法: ./start-gateway-lan.sh

set -e

echo "🦞 Starting OpenClaw Gateway in LAN mode..."
echo ""

# 1. 清理旧进程
echo "1️⃣  Cleaning up old gateway processes..."
pkill -f "node.*gateway" || true
sleep 1

# 2. 启动 gateway
echo "2️⃣  Starting gateway on port 18789 with LAN binding..."
/usr/local/share/nvm/versions/node/v24.11.1/bin/node /home/codespace/openclaw/dist/entry.js gateway --port 18789 --bind lan > /tmp/gateway.log 2>&1 &
GATEWAY_PID=$!

# 3. 等待启动
sleep 3

# 4. 验证
echo "3️⃣  Verifying gateway is running..."
if lsof -i :18789 > /dev/null 2>&1; then
    echo "✅ Gateway is listening on port 18789"
else
    echo "❌ Gateway failed to start. Check logs:"
    tail -50 /tmp/gateway.log
    exit 1
fi

# 5. 显示访问地址
echo ""
echo "4️⃣  Gateway is ready! Access it at:"
echo ""
GATEWAY_IP=$(hostname -I | awk '{print $1}')
echo "   WebSocket: ws://${GATEWAY_IP}:18789"
echo "   Dashboard: http://${GATEWAY_IP}:18789/"
echo "   API: http://${GATEWAY_IP}:18789/api/"
echo ""
echo "📋 Real-time logs:"
echo "   tail -f /tmp/gateway.log"
echo ""
echo "✅ Gateway started with PID: $GATEWAY_PID"
