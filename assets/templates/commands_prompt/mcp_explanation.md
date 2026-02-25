### 🌐 什么是 MCP (Model Context Protocol)?

MCP 是 Anthropic 推出的开放协议，旨在让 AI 模型安全地访问本地工具、提示词和资源。

在 Opengravity 中，您可以通过 `.opengravity/mcp_config.json` 配置多个服务器，让 AI 具备搜索网页、读取数据库或操作本地文件的能力。

**可用子命令:**
- `/mcp list`: 查看当前在线的服务器。
- `/mcp refresh`: 重新加载配置文件并重连。
