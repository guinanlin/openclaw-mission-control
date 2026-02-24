## GitHub Codespaces 快速开始

### 创建 Codespace

1. 在 GitHub 仓库页面点击 **`Code`**
2. 选择 **`Codespaces`** 标签
3. 点击 **`Create codespace on master`**

### Codespaces 自动实现的功能

✅ **完整的开发环境**（Python 3.12、Node.js 20、Docker）  
✅ **所有依赖已安装**（uv、npm packages）  
✅ **数据库启动**（PostgreSQL + Redis 自动在后台运行）  
✅ **VS Code 扩展预配置**（Python、ESLint、Prettier 等）  
✅ **端口自动转发**（3000、8000 可通过 Codespaces 端口访问）  

### 启动应用

#### 方式1：使用VS Code集成终端

**终端1 - 后端**
```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

**终端2 - 前端**
```bash
cd frontend
npm run dev
```

#### 方式2：使用 Makefile

```bash
# 检查代码质量
make check

# 运行测试
make backend-test
make frontend-test

# 应用数据库迁移
make backend-migrate
```

### 访问应用

- **前端**: `https://<codespace-id>-3000.preview.app.github.dev`
- **后端 API 文档**: `https://<codespace-id>-8000.preview.app.github.dev/docs`

Codespaces 会自动生成可共享的公开 URL。

### Codespaces 特性

| 功能 | 说明 |
|------|------|
| 自动 SSH | 配置了 GitHub SSH 密钥 |
| git 集成 | `gh` CLI 预装，简化 PR/Issue 管理 |
| 长期存储 | 所有环境变量和工作保存到你的账户 |
| 费用 | 免费配额（每月 120 小时） |

### Codespaces vs 本地开发

| 特性 | Codespaces | 本地 + DevContainer |
|------|-----------|------------------|
| 无需本地安装 | ✅ | ❌ 需要 Docker |
| 浏览器访问 | ✅ | ❌ localhost 仅限本地 |
| 完整隔离 | ✅ | ⚠️ 共享主机 Docker |
| 费用 | 需小时配额 | 本地资源 |

### 关闭 Codespace

- **停止**: 侧边栏 → Codespaces → 右键 → Stop
- **删除**: 侧边栏 → Codespaces → 右键 → Delete

---

**💡 提示**: 设置 Codespace 为"自动削减"以节省配额。
