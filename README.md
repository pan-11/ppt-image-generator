# Local Image Generator

这是一个只在本地电脑运行的图片生成工具。前端负责批量录入和历史查看，后端负责调用 ToAPIs、并发排队、保存图片和打包下载。

## 现在支持

- 一次最多提交 50 条任务
- 固定并发 5 条，前一条完成后自动补位继续跑
- 每行独立设置提示词、模型、比例、分辨率、张数、参考图
- 支持全局参考图和单行参考图上传
- 历史记录本地保存，可删除批次和单张图片
- 单图下载、整批 ZIP 下载
- API Key 只放在本地后端，不暴露到浏览器

## 最简单的启动方式

1. 双击根目录里的 [一键启动.bat](D:\codex_project\图片生成\.worktrees\codex-image-generator\一键启动.bat)
2. 如果是第一次运行，它会自动提示你填写 `.env` 里的 `TOAPIS_API_KEY`
3. 启动成功后会自动打开浏览器：

```text
http://127.0.0.1:5173
```

说明：

- 关闭启动后的黑色命令行窗口，程序就会停止
- 第一次运行如果没有安装依赖，会自动执行 `npm install`

## 手动启动方式

```bash
npm install
npm run dev
```

## 环境变量

- `TOAPIS_API_KEY`: 你的 ToAPIs Key
- `APP_DATA_DIR`: 本地数据目录，默认 `app-data`
- `PORT`: 后端端口，默认 `3017`
- `MAX_CONCURRENCY`: 最大并发，默认 `5`
- `MAX_BATCH_SIZE`: 单批上限，默认 `50`

## 常用命令

```bash
npm test
npm run lint
npm run build
```
