# QuoteFlow

QuoteFlow 现在使用前后端分层目录，适合继续往正式项目演进。

## 目录结构

```text
QuoteFlow/
├─ frontend/          # 静态前端原型
│  ├─ assets/
│  ├─ pages/
│  └─ index.html
├─ backend/           # Node API 骨架
│  ├─ package.json
│  └─ src/
├─ docs/              # 设计与说明文档
├─ scripts/           # 开发辅助脚本
├─ index.html         # 根目录入口页
└─ .gitignore
```

## Frontend

- 入口: `frontend/index.html`
- 工作台页面: `frontend/pages/workspace/`
- 共享样式: `frontend/assets/css/`
- 共享脚本: `frontend/assets/js/`

## Backend

- 启动目录: `backend/`
- 默认接口: `GET /api/health`
- 启动命令:

```bash
cd backend
npm run dev
```

## v0.0.1 联调验收

项目现在提供了容器化联调链路，适合在本机没有 Node 环境时直接验收。

1. 启动 Docker daemon
   在 macOS 上可直接打开 `Rancher Desktop.app`
2. 在项目根目录启动整套服务

```bash
docker compose up --build
```

3. 打开验收地址

- 前端: `http://localhost:5173`
- 后端健康检查: `http://localhost:3000/api/health`
- 版本接口: `http://localhost:3000/api/version`

首次启动会自动完成 Prisma `db push` 和 demo 数据 `seed`。

### Demo 登录账号

所有种子账号密码统一为 `QuoteFlow123!`

- `admin@quoteflow.local`
- `analyst@quoteflow.local`
- `buyer@quoteflow.local`
- `approver@quoteflow.local`
- `finance@quoteflow.local`

## 后续建议

- 前端下一步可以继续拆成 `components/`、`modules/`、`services/`
- 后端下一步可以接数据库、认证、业务路由和环境变量管理
