[简体中文](README.md) / [English](README_EN.md)

# 🌏 Opengravity 
![Inspired by Apple UI](https://img.shields.io/badge/UI-Inspired_by_Apple-F5F5F7?logo=apple&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)
![model](https://img.shields.io/badge/Model-DeepSeek-orange)
![Platform](https://img.shields.io/badge/Platform-VSCode-blue)
![MCP](https://img.shields.io/badge/Supported-MCP-black)
## 🤔 Overview
**Opengravity** is a Vibe Coding assisting system integrated in Visual Studio Code。Based on streaming chatting，**Opengravity** was inspired by the interaction concept of Gemini CLI and the Agentic Evolvement  of OpenClaw.
## 🎯 Aims
- ⚡ **Efficiency**: Providing keyboard stream for daily vibe coding，Not to leave the keys when vibe coding.
- 🎨 **Vibe Coding**: Practicing my vibe coding skills.
- 🧬 **Agent Self-supporting**: To build an agent that evolve with the project, and learn through time.
- 🧱 **Workflow System**：Build my workflow based on the file system: `codes/`,`brainstorm/`, `notes/`, `daily/`, `todo/`, `reviews/` .
## 📌 Features
### 🔄 Interactions
- **#️⃣ Commands**：Opengravity has a command system, mainly inspired by GeminiCLI.
- **📝 Logger**：Opengravity has a log system, if you encounter unexpected errors, you can check loggers and debug.
- **💬 Immersive Chatbox**：A webview with in-time Markdown, code highlighting. Everything serves focus.
- **🪟 Widgets**：Opengravity believes that information inform is a must, you'll be informed when tool calls.
- **⌨️ Keyboard Inputs**：For efficiency, you don't need to touch your mouse or your touchpad when vibe coding. Direct `Enter` ↩️ to approve and `Esc` ♿️ to decline code changes, keeping your hands on the home row.
- **💡 IntelliSense**: Context-aware completion for commands (`/`), files (`@`), and terminal triggers (`!`), supporting full keyboard navigation and auto-scrolling.
- **✅ Edits Confirming**：After agent edits, Direct `Enter` ↩️ to approve and `Esc` ♿️ to decline code changes, keeping your hands on the home row.
### 🛠️ Skills Support
- **🔧 Atomic Tools**: Integrated support for `write_file`, `read_file`, `run_commands`, and `replace`.
- **🧑‍💻 TOML Custom Commands**: Add new capabilities on the fly by defining `.toml` command templates in `.opengravity/commands/`.
- **🌐 MCP Support**: Full Model Context Protocol integration for external tools, prompts, and resources.
### 🤖 Agent Autonomy
Opengravity empowers the agent with controlled autonomy, ensuring safety while enabling growth.
- **Self-Governance**: The `.opengravity/` directory is the agent's "mind"—it has the authority to modify its own configuration and logic.
- **Heartbeat & Soul**: Architectural concepts like `HEARTBEAT.md` and `SOUL.md` define the agent's persistent state and operational rhythm.
- **Dual-Mode Recursion**:
  - `/manual`: 10-step recursion limit for guided tasks.
  - `/auto`: 100-step recursion limit for autonomous execution.
### ⚡ Execution & Permissions
- **God Mode Shell**: Direct execution for user-initiated `!` commands with real-time streaming output to a dedicated terminal widget.
- **Dual-Track Diffing**:
  - **Evolution**: Silent inline diffs for configuration files.
  - **Business**: Forced `vscode.diff` review for all project source code modifications.
## ✌️ Getting Started

1. **Install**: Load the `.vsix` or run in extension development host.
2. **API keys**：Search "opengravity" in vscode settings and input your API keys.
3. **Init**: Type `/init` to scaffold the `.opengravity` structure.
4. **Explore**:
  - `!ls` for the God Mode terminal.
  - `/help` to list all skills.
  - `@filename` to provide context.
5. **Have fun.**
## ⚒️ Tech Stack
- **Frontend**: Pure JavaScript (ES6+) + CSS3 (Zero frameworks).
- **Backend**: TypeScript + VS Code Extension API.
## 💩 Known Issues
There must be unknown issues, please let me know!
- [ ] Context pruning algorithm pending implementation; potential for high token usage in long sessions.
- [ ] Complex multi-file evolution may occasionally hit VS Code file system locks.
- [ ] Native web-search support (outside of MCP) is not yet implemented.
- [ ] A complex `chatViewProvider.ts` .
## 😎 TODO
- [ ] Implement RAG-based long-term memory.
- [ ] Visual management panel for MCP resources.
- [ ] Support for A2A (Agent-to-Agent) protocol.
- [ ] Multi-persona hot-reloading.
## 💻 Technical Details
Key implementation files:
1. **Folder Workflow**: `src/utils/templateManager.ts`, `src/commands/slash/init.ts`
2. **Inline Diff**: `src/chatViewProvider.ts`, `src/utils/diffProvider.ts`
3. **MCP Support**: `src/mcp/mcpHost.ts`
4. **IntelliSense**: `src/webview/chat.js` (Frontend), `src/chatViewProvider.ts` (Backend)
5. **Prompt Templates**: `src/utils/templateManager.ts`
6. **Command System**: `src/commands/CommandDispatcher.ts`, `src/commands/Registry.ts`
7. **Logging**: `src/utils/logger.ts`, `src/utils/outputChannel.ts`
8. **Frontend Core**: `src/webview/` directory.
9. **Session History**: `src/session/HistoryManager.ts`, `src/services/ChatHistoryService.ts`
10. **Atomic Tools**: `src/tools/executor.ts`, `src/tools/definitions.ts`
## 🧘 The Opengravity Creed
- **Autonomy is Essential**: Agents must have the power to act.
- **Planning is Prerequisite**: Design before execution for maximum efficiency.
- **Progression is Possible**: Agents can learn, adapt, and improve.
- **Vibe Coding❌ Agentic Engineering ✅**
- **Begin with Imagination.**
## 🙏 Acknowledgements
### Pioneers explore the roads, Opengravity travels.
- **OpenClaw**: For the inspiration regarding agent autonomy and tool-use patterns.
- **Gemini CLI**: For the "Keyboard First" interaction model and robust prompt engineering.
- **DeepSeek**: For the powerful reasoning capabilities supporting this project.
- **You**: Thank you reading.

---

Code with ❤️ by Ctling & Echo.
 