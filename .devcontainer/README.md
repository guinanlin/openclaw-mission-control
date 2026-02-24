# DevContainer 配置

这个项目已配置为 VS Code DevContainer，确保所有开发人员都拥有一致的开发环境。

## 什么是 DevContainer？

DevContainer（开发容器）是 VS Code 的一项功能，允许你在 Docker 容器中进行开发，而不是在本地机器上安装所有依赖。这确保：

✅ 环境一致性：避免 "在我的机器上可以工作" 的问题  
✅ 快速启动：无需复杂的本地设置  
✅ 隔离依赖：不会污染主机系统  
✅ 团队协作：所有人使用完全相同的工具版本  

## 快速开始

### 前置要求

- Visual Studio Code / GitHub Codespaces
- [Dev Containers 扩展](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)（本地 VS Code）
- Docker（本地使用时）

### 在本地 VS Code 中打开

1. 克隆仓库
2. 在 VS Code 中打开项目文件夹
3. 点击左下角 **`><`** 按钮（或按 `Ctrl+Shift+P`）
4. 选择 **"Dev Containers: Reopen in Container"**

VS Code 将：
- 构建 DevContainer 镜像
- 启动容器
- 自动安装依赖（`make setup`）
- 启动 PostgreSQL 和 Redis

### 在 GitHub Codespaces 中使用

1. 在 GitHub 中点击 **`Code`** → **`Codespaces`** → **`Create codespace on master`**
2. VS Code 将自动在 DevContainer 中打开
3. 所有工具和依赖已自动配置

## 包含的工具

### 系统工具
- **Python 3.12** - 后端运行时
- **Node.js 20** - 前端运行时
- **Docker** - 运行容器服务
- **git** - 版本控制

### Python 工具
- **uv** - 快速 Python 包管理器
- **pytest** - 单元测试框架
- **black** - 代码格式化
- **isort** - import 排序
- **flake8** - lint
- **mypy** - 类型检查

### Node.js 工具  
- **npm** - 包管理器
- **prettier** - 代码格式化
- **eslint** - lint
- **vitest** - 测试框架
- **typescript** - 类型检查

### VS Code 扩展（自动安装）
- Python 开发工具（Pylance、Black Formatter）
- ESLint & Prettier 集成
- Tailwind CSS 智能感知
- Docker 支持
- GitHub Copilot & GitLens

## 文件说明

```
.devcontainer/
├── devcontainer.json            # 主配置文件
├── docker-compose.override.yml  # Docker Compose 覆盖配置
├── startup-guide.md             # 启动提示（容器启动时显示）
└── README.md                    # 本文件
```

### devcontainer.json

主配置文件包含：
- 基础镜像：`python:3.12`
- Feature：Node.js、Docker-in-Docker
- 端口转发：3000（前端）、8000（后端）、5432（DB）、6379（Redis）
- VS Code 扩展和设置
- 启动脚本：`make setup` 和 `docker compose up -d db redis`

## 开发工作流

### 终端 1：后端服务器
```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

### 终端 2：前端服务器
```bash
cd frontend
npm run dev
```

### 生成 API 客户端
```bash
make api-gen
```

## 常见问题

### Q: DevContainer 与我的本地环境不同步？
**A:** 重建容器：点击 **`><`** → **"Dev Containers: Rebuild Container"**

### Q: 如何访问数据库？
**A:** DevContainer 自动启动 PostgreSQL（端口 5432）和 Redis（端口 6379），凭证在 `.env` 中。

### Q: 我可以在 DevContainer 中使用我喜欢的工具/扩展吗？
**A:** 是的。在 VS Code 中安装后，编辑 `devcontainer.json` 的 `extensions` 列表。

### Q: 如何停止后台服务？
**A:** 在 VS Code 中的 **Docker** 侧边栏中手动管理，或在终端运行：
```bash
docker compose -f compose.yml --env-file .env down
```

### Q: 我需要给 DevContainer 添加其他依赖？
**A:** 编辑 `backend/pyproject.toml`（Python）或 `frontend/package.json`（Node），然后运行 `make setup`。

## 故障排除

### 端口冲突
如果 3000、8000、5432 或 6379 已被占用，编辑 `.devcontainer/devcontainer.json` 中的 `forwardPorts`。

### 权限问题
确保 Docker daemon 可访问。运行：
```bash
docker ps
```

### 重建后速度慢
DevContainer 会缓存镜像和层。首次构建较慢，但后续重建会快得多。

---

**需要更多帮助？** 查看 [VS Code DevContainers 官方文档](https://code.visualstudio.com/docs/devcontainers/containers)
