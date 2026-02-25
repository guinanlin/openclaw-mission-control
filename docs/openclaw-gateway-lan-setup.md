# OpenClaw Gateway LAN 暴露指南

## 概述

本文档说明如何将 OpenClaw Gateway 暴露到本地网络（LAN），使得同网络内的其他设备可以访问 gateway。

## 快速开始

### 前提条件
- OpenClaw CLI 已安装并配置
- 网络上的 gateway 主机和客户端在同一 LAN 内

### 方案 A：直接运行方式（推荐用于开发）

这是最简单直接的方法，跳过 systemd 的复杂配置。

#### 1. 清理旧进程

```bash
pkill -f "node.*gateway"
sleep 1
```

#### 2. 启动 gateway，绑定到 LAN

```bash
/usr/local/share/nvm/versions/node/v24.11.1/bin/node /home/codespace/openclaw/dist/entry.js gateway --port 18789 --bind lan
```

或后台运行（带日志输出）：

```bash
/usr/local/share/nvm/versions/node/v24.11.1/bin/node /home/codespace/openclaw/dist/entry.js gateway --port 18789 --bind lan > /tmp/gateway.log 2>&1 &
```

#### 3. 验证端口监听

```bash
# 检查端口是否在监听
lsof -i :18789

# 预期输出显示：
# openclaw- 36265 root   24u  IPv4 444624      0t0  TCP *:18789 (LISTEN)
```

#### 4. 查看 gateway 日志

```bash
tail -50 /tmp/gateway.log
```

预期看到类似输出：
```
[gateway] listening on ws://0.0.0.0:18789 (PID xxxxx)
```

### 方案 B：使用 OpenClaw 命令行

也可以用 openclaw 命令重启 gateway：

```bash
openclaw gateway restart --bind lan --force
```

## 访问 Gateway

### 获取本机 IP 地址

```bash
hostname -I
```

例如输出：`10.0.2.235 172.17.0.1 172.18.0.1`

### 从 LAN 上的其他设备访问

使用主机 IP 地址和端口号访问：

- **WebSocket**: `ws://10.0.2.235:18789` （替换为实际 IP）
- **Dashboard**: `http://10.0.2.235:18789/`
- **API**: `http://10.0.2.235:18789/api/...`

## 三种绑定模式

OpenClaw gateway 支持以下绑定模式：

| 模式 | bind 参数 | 说明 | 访问范围 |
|------|----------|------|--------|
| Loopback | `--bind loopback` | 仅本机访问 | 127.0.0.1 |
| LAN | `--bind lan` | 本地网络内访问 | 0.0.0.0（所有网络接口） |
| Tailnet | `--bind tailnet` | 通过 Tailscale 访问 | Tailscale 网络 |
| Auto | `--bind auto` | 自动选择 | 根据配置 |
| Custom | `--bind custom` | 自定义绑定 | 按配置 |

## 故障排查

### 问题 1：端口未监听

**症状**：`lsof -i :18789` 没有输出

**原因**：gateway 进程可能未启动或启动失败

**解决方案**：
```bash
# 查看日志
tail -100 /tmp/gateway.log

# 查看进程
ps aux | grep "node.*gateway" | grep -v grep

# 重新启动
pkill -f "node.*gateway"
sleep 1
/usr/local/share/nvm/versions/node/v24.11.1/bin/node /home/codespace/openclaw/dist/entry.js gateway --port 18789 --bind lan
```

### 问题 2：无法从其他设备连接

**症状**：从 LAN 上的其他设备无法访问 `http://10.0.2.235:18789/`

**可能原因**：
1. 防火墙阻止 18789 端口
2. IP 地址错误（获取错误的主机 IP）
3. 网络隔离

**解决方案**：
```bash
# 1. 验证正确的 IP 地址
hostname -I

# 2. 检查防火墙规则
sudo ufw status
sudo ufw allow 18789/tcp

# 3. 从同网络的设备测试连接
curl -v http://10.0.2.235:18789/
```

### 问题 3：安全警告

**现象**：启动时出现安全警告

```
security warning: dangerous config flags enabled: gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true
```

**说明**：这是预期的开发时行为。生产环境应关闭此标志。

**解决**（仅在生产环境需要）：
```bash
openclaw security audit
openclaw security audit --fix
```

## 对比：systemd vs 直接运行

| 特性 | systemd | 直接运行 |
|------|--------|--------|
| 复杂度 | 高（需配置服务文件） | 低（直接启动） |
| 持久化 | 是（系统重启后自动启动） | 否（需手动启动） |
| 调试 | 困难（需查看系统日志） | 容易（实时输出） |
| 开发用途 | 不推荐 | 推荐 |
| 生产用途 | 推荐 | 不推荐 |

## 推荐的完整启动脚本

将以下内容保存为 `start-gateway-lan.sh` 在项目根目录：

```bash
#!/bin/bash
# 启动 OpenClaw Gateway LAN 模式

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
```

使用方法：
```bash
chmod +x start-gateway-lan.sh
./start-gateway-lan.sh
```

## 相关命令快速参考

```bash
# 启动（直接运行）
/usr/local/share/nvm/versions/node/v24.11.1/bin/node /home/codespace/openclaw/dist/entry.js gateway --port 18789 --bind lan

# 查看状态
openclaw gateway status

# 停止
pkill -f "node.*gateway"

# 查看日志
tail -f /tmp/gateway.log

# 检查端口
lsof -i :18789

# 获取 IP
hostname -I
```

## 更多信息

- [OpenClaw Gateway WebSocket 文档](./openclaw_gateway_ws.md)
- [本地开发指南](./本地开发指南.md)
- [开发配置](./03-development.md)
- 官方文档：https://docs.openclaw.ai/gateway/remote
