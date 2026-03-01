[简体中文](README.md) / [English](README_EN.md)

# 🌏 Opengravity 
![借鉴了 Apple UI](https://img.shields.io/badge/UI-模仿_Apple-F5F5F7?logo=apple&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)
![model](https://img.shields.io/badge/Model-DeepSeek%2FClaude-orange)
![Platform](https://img.shields.io/badge/Platform-VSCode-blue)
![MCP](https://img.shields.io/badge/Supported-MCP-black)
## 🤔 概述
**Opengravity** 是一个集成在 Visual Studio Code 中的 **Vibe Coding 辅助系统**。在实现了流式对话基础上，**Opengravity** 参考了 Gemini CLI 的部分功能与 OpenClaw 的自我更改理念。
## 🎯 项目目标
- ⚡ **提高效率**：为日常开发提供键盘流，目的是在 Vibe Coding 时不需要离开键盘。
- 🎨 **Vibe Coding**：练习我的Vibe Coding技巧。
- 🧬 **Agent 自主性**：打造一个能够修改提示词和Skills、随着项目成长、了解项目构成的 Agent。
- 🧱 **工作流系统**：建立基于文件夹`codes/`,`brainstorm/`, `notes/`, `daily/`, `todo/`, `reviews/`的工作流。
## 📌 主要功能
### 🔄 主要交互
- **#️⃣ 命令系统**：Opengravity拥有一套命令系统，开发主要受到 GeminiCLI 的启发！
- **📝 日志系统**：Opengravity拥有日志系统，如果在运行过程中遇到bug，您可以根据日志系统进行调试。
- **💬 沉浸对话**：基于 Webview 的聊天界面，支持 Markdown 实时渲染、代码高亮，同时为了提高沉浸感，易于专注，Opengravity没有为Agent设置对话框，而且淡化了思考过程的显示，保证了对话的连续性。
- **🪟 功能小窗**：Opengravity相信用户需要信息的透明，在所有工具的执行中，均会使用小窗提示用户相关工具信息。
- **⌨️ 键盘输入**：在不需要自己编码时，用户可以留在对话窗口中工作，同时手不需要离开键盘，进行 Vibe Coding 更加高效
- **💡IntelliSense**：输入 `/` 呼出指令，输入 `@` 引用文件，输入 `!` 调用终端。支持方向键选择、Tab 补全，全程无需鼠标。
- **✅修改审批**：Agent 修改业务代码，除了点击按钮的审批方式以外，支持键入 `Enter` ↩️批准，`Esc` ♿️拒绝。
### 🛠️ Skills支持
Opengravity 支持 Skills：
- **🔧Tools**：Opengravity 可以使用 `write_file`, `read_file`, `run_commands`, `replace` 四项工具。具体实现见 `## 💻 技术细节`。
- **🧑‍💻TOML自定义指令**：Opengravity支持简洁的自定义指令，灵感来源于 `gemini-cli` ，你可以通过定义以 `.toml` 结尾的文件自定义 `slash commands` 具体例子可以参考 `/init` 之后新添文件。
- **🌐MCP支持**：Opengravity完整支持MCP服务器加载工具、提示词和资源。
### 🤖 Agent 自主性
Opengravity 赞同 OpenClaw 的部分有关 Agent 自主性的看法，并且在给予 Agent 自主性的同时，基本保证文件的安全。
-  `.opengravity/` 中所有的文件均与 Agent 的工作方式，回答风格相关，Opengravity 把该文件夹的自主权交给 Agent，当然用户同样可以更改。
- 在 `SYSTEM.md` 中参考了许多 OpenClaw 的概念，比如 `HEARTBEAT.md` 和 `SOUL.md` 。
- `/auto` 进入自动模式，通过 `HEARTBEAT` 的机制确定 Agent 的活动，在一般 `/manual` 模式下，Agent 只允许一问一答。区别： `/auto` 模式最大递归深度：100； `/manual` 最大递归深度：10。
### ⚡ 执行权限
- **Shell 权限**：以 `!` 开头的指令（如 `!ls -la`）将直接执行，Agent 需要执行的指令需要用户的审批，审批完成后会流式输出到小窗。
- **inline diff**：在对人格文件（ `.opengravity/` 中的文件）使用 `replace` 之后，只有小窗会显示执行前后的不同，以告知用户 Agent 的认知发生改变。如果对业务文件使用 `replace` 或 `write_file` 则会触发 `vscode.diff` 在主要窗口上显示 diff 。同时小窗也会显示 diff。
## ✌️ 开始使用
1. **安装扩展**：加载 `.vsix` 或在 VS Code 中调试运行。
2. **初始化**：在聊天框输入 `/init`，Opengravity 会自动在当前目录下创建 `.opengravity` 结构。
3. **体验指令**：
- 输入 `!ls` 体验上帝模式终端。
- 输入 `/help` 查看所有技能。
- 输入 `@文件名` 将代码上下文喂给 AI。
## ⚒️ 技术栈
- **Frontend**: Pure JavaScript (ES6+) + CSS3 (No React/Vue/Tailwind)。
- *Deps*: `marked` (渲染), `highlight.js` (高亮), `ansi_up` (终端转义)。
- **Backend**: TypeScript + VS Code Extension API。
## 💩 已知问题
未知问题一定存在，非常期待您的反馈！
- [ ] 上下文剪枝算法尚未实装，长时间对话可能导致 Token 消耗过大。
- [ ] 复杂的自进化重构（跨多文件）可能偶尔触发 VS Code 的文件锁冲突。
- [ ] `chatViewProvider.ts` 文件耦合程度高，容易引发混乱。
- [ ] 除去MCP，不支持原生联网搜索。
## 😎 TODO
非常期待您的建议，我会尽力做到更好！
- [ ] 实现 RAG。
- [ ] 引入 MCP 的可视化管理面板。
- [ ] A2A 协议支持。
- [ ] 多Persona热重载。
- [ ] sandbox沙箱模式。
## 💻 技术细节
所有相关技术的文件：
1. **文件夹工作流**：`src/utils/templateManager.ts`, `src/commands/slash/init.ts` —— 负责初始化 `.opengravity` 结构及管理模板。
2. **inline diff**：`src/chatViewProvider.ts`, `src/utils/diffProvider.ts` —— 实现自动进化与业务代码的双轨审批逻辑。
3. **MCP supports**：`src/mcp/mcpHost.ts` —— 桥接外部工具与 Agent 能力。
4. **IntelliSense**：`src/webview/chat.js` (前端), `src/chatViewProvider.ts` (后端) —— 实现 `/`, `@`, `!` 的智能补全。
5. **提示词模板**：`src/utils/templateManager.ts` —— 动态组合 System Prompt 及 User Prompts。
6. **命令系统**：`src/commands/CommandDispatcher.ts`, `src/commands/Registry.ts` —— 基于注册表模式的指令调度中枢。
7. **日志系统**：`src/utils/logger.ts`, `src/utils/outputChannel.ts` —— 实时记录 Agent 行为与调试信息。
8. **前端**：`src/webview/` 目录 —— 原生 JS/CSS 实现的高性能聊天容器。
9. **对话历史**：`src/session/HistoryManager.ts`, `src/services/ChatHistoryService.ts` —— 负责上下文持久化与快照。
10. **工具**：`src/tools/executor.ts`, `src/tools/definitions.ts` —— 封装底层的 I/O 与终端执行原子操作。

## 🧘 Opengravity相信：
- **Agent 需要自主性** OpenClaw已经验证了 Agent 自主的重要性。
- **Agent 需要计划** 先规划实现方案，Agent 逐一实现，效率更高。
- **Agent 可以进步** OpenClaw验证了：Agent 可以通过学习和认知，提高能力。
- **Vibe Coding❌ Agentic Engineering ✅**
- **Begin with Imagination.** 想象力比技术力更加重要！
## 🙏 致谢
### Opengravity 站在巨人的肩膀上！
- **OpenClaw**：启发了 Opengravity 的 Agent 自主性设计与工具调用范式！感谢 Peter Steinberger！
- **Gemini CLI**：启发了“键盘优先”的交互思路与 System Prompt 的构建策略！感谢 Google Gemini 团队！
- **DeepSeek**：为 Opengravity 提供了强大的推理模型支持！
- **你**：感谢你看到这里，你的支持是我的动力！

---

$\mathcal{Code\quad with}$ ❤️ $\mathcal{by\quad Ctling\quad \&\quad Echo.}$ 