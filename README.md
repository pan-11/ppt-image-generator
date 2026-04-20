# Local Image Generator

本项目是一个只在本机运行的图片生成工具，前端负责批量编辑和历史查看，后端负责调 ToAPIs、排队执行、保存图片和打包下载。

## 当前已实现

- 一次性编辑和提交最多 50 条任务
- 固定并发 5 条，跑完自动补位
- 每行独立设置提示词、模型、尺寸、张数、参考图模式
- 支持全局参考图和本行参考图上传
- 后端代理 ToAPIs，API Key 不暴露到浏览器
- 本地 SQLite 历史记录
- 单图下载、整批 ZIP 下载、删除批次、删除单图
- 刷新页面后继续读取当前批次状态

## 启动方式

1. 复制 `.env.example` 为 `.env`
2. 填入你的 `TOAPIS_API_KEY`
3. 安装依赖

```bash
npm install
```

4. 启动前后端

```bash
npm run dev
```

5. 打开浏览器访问

```text
http://127.0.0.1:5173
```

## 环境变量

- `TOAPIS_API_KEY`: ToAPIs 密钥
- `APP_DATA_DIR`: 本地数据目录，默认 `app-data`
- `PORT`: 后端端口，默认 `3017`
- `MAX_CONCURRENCY`: 最大并发，当前默认 `5`
- `MAX_BATCH_SIZE`: 单批上限，当前默认 `50`

## 常用命令

```bash
npm test
npm run lint
npm run build
```
