# 🤖 Opengravity：基于 AI 的TUI式个人工作流管理系统

## ⚠️ 非常重要！！！！

 Opengravity 灵感来源于 @bilibili/MarsLUL 的 OrbitOS (一个Obsidian的工作流生产力插件https://github.com/MarsWang42/OrbitOS)，绝对比 Opengravity 更稳定可靠

 Opengravity 是我做了给自己用的小插件，很多地方没有经过严谨的验证，肯定存在很多恶性的bug，我没有扎实的技术背景，大部分功能是和大模型聊天加上的
如果你正在考虑把 Opengravity 放到自己的工作中，我劝你放弃，这是我的玩具，不是个合格的工具。

当然如果你觉得我的想法不错，你也觉得你可以用这么一个工具，那你可以随意更改，你直接commit到我的master都可以

---

## 🔨 使用指南

如果你只是看看的话，跳过这一条，后面比较好笑

初始化的时候会建几个文件夹：`codes`、`reviews`、`notes`、`daily`、`brainstorm`、`todo`
然后你可以在codes里面工作，notes里面写笔记，daily里面写日记，AI读取以后会把codereview放到reviews里面，你也可以让它头脑风暴一下放到brainstorm里面，或者让它帮你整理你需要做的事情放到todo里面来开始你的一天，具体你可以用这些指令：


1. 命令：`-codereview <文件路径>` 执行代码审查

2. 命令：`-brainstorm <笔记路径>` 扩展给定想法

3. 命令：`good morning` 生成每日简报

4. 命令：`-reflect <笔记路径>` 可以反思一下相关笔记

5. 命令：`-link` 建议知识库内的连接。

6. 命令：`-help` 显示所有可用命令。

---

## 📜 项目概述

Opengravity 是一个在 VSCode 中大致模拟下一代 AI 助手的实验性项目。

这个项目想尝试结合 **Agent 模式** 和 **OrbitOS 工作流管理** ，将大型语言模型的推理能力融入我的日常工作流。

**核心目标：**
提高我的学习效率，体验VibeCoding，帮我替代一下GeminiCLI和Copilot，好玩

---

## ✨ 主要特性

### 1. 混合工具链与 Agent 架构

- **支持MCP**：支持 **Model Context Protocol (MCP)** 的工具，因为我想让DeepSeek上网。DeepSeek有网瘾，要设置提示词让它少用工具。
- **原生工具**：使用npx启动MCP工具有点慢，所以我有原生的工具：read_file,write_file,run_command.
- **可拓展**：`mcpHost` 预留了接口，可以随时接入外部 MCP 服务器

### 2. TUI 风格与实时交互

- **视觉风格**：我很喜欢 GeminiCLI 和 ClaudeCode 的风格，但是因为技术太差了模仿不来
- **流式输出**：DeepSeek API里面推荐的，还是比较流畅
- **思考流**：可以看到AI的reasoning过程，希望这可以降低决策的失误率
- **关键操作**：以下两个功能是模仿Copilot的，因为我做不出来，所以解决办法很原始
    - **点击代码块**：一键将 AI 提供的代码片段插入到当前编辑器光标处
    - **Diff 对比**：通过 `vscode.diff` 命令，基本实现了对新旧代码的红绿对比功能(我做不出来Copilot的对比功能)

### 3. 工作流与数据管理

- **文件系统**：通过 `initializeWorkspace` 功能，自动创建了结构化的工作区目录（`codes`, `notes`, `reviews` 等）。
- **对话历史**：实现对话历史的**本地 JSON 文件读写**，保证插件在重启后能恢复上下文。

---

## ⚠️ 已知不足与局限性

- **Agent 性能瓶颈**：响应速度和稳定性受限于 DeepSeek API 的访问速度。(DeepSeek的AI味太冲了)
- **Diff 局限**：目前的 Diff 功能仅为 **侧边栏对比**，未实现 Antigravity/Cursor 复杂的 **行内 Inline Diff** 替换功能。(我非常想要这个功能)
- **错误处理**：有很多我不知道的错误(我随便用一下就报错了，非常难受)

---

## ⚙️ 扩展设置

本扩展通过 `contributes.configuration` 提供了以下设置：

*   `opengravity.provider`: 选择大语言模型（`deepseek` / `gemini`）。Gemini的我还没做，但是因为基本上可以用了，所以懒得做了
*   `opengravity.apiKey`: API 密钥。

## 🚀 启动与运行

1.  **安装**：通过 VSIX 文件安装本扩展。
2.  **配置**：在 VS Code 设置中搜索 `Opengravity`，输入您的 API Key。
3.  **初始化**：打开一个文件夹，插件将提示您进行工作区初始化。
4.  **使用**：打开侧边栏，开始输入指令。

---

## 📜 遵循指南

遵循 VS Code 的扩展指南

---

# 🤖 Opengravity: The TUI AI Personal Workflow System

## ⚠️ CRITICAL WARNING

Opengravity inspired by @bilibili/MarsLUL's OrbitOS (a productivity framework for Obsidian). **It's obvious that OrbitOS is far more stable and reliable than this extension.**

Opengravity is a small personal project built primarily for **self-use and experimentation**. It has not undergone rigorous validation and undoubtedly contains numerous critical bugs. **I do not have a robust technical background, and most functions were implemented by talking to Gemini, GPT, deepseek(especially confusing one)etc.**

If you are considering integrating Opengravity into your professional workflow, **You'd better not.** This is my toy, not a qualified tool. Feel free to modify it if you appreciate the core idea and believe you can improve it, and if you really considering my project, that just make my day.

---

## 🔨 Usage

if you're just looking around, feel free to skip this, cause this is boring while following things are funnier.

these directories would be created when you initialize:`codes`、`reviews`、`notes`、`daily`、`brainstorm`、`todo`
then you can code in codes/, take notes in notes/, write about what did you do today in daily/
LLM will review your codes and put reviews into reviews/, or put a mermaid graph into brainstorm/
you can even start your day by putting things into todo. Using commands as follows:

1. `-codereview <file>` review your code

2. `-brainstorm <file>` expand your thinking

3. `good morning` generate a short todo of today.

4. `-reflect <file>` reflect on your notes

5. `-link` linking your codes brainstorms and notes

6. `-help` 


---

## 📜 Project Overview

Opengravity is an experimental project in VS Code roughly mimicking the next generation of AI assistants.
which im dying to imagine having one with me when im struggling with my works. and i struggled with this for like weeks but it just changed nothing.

The project attempts to combine **Agent Mode** with **OrbitOS Workflow Management** to integrate the reasoning capabilities of Large Language Models into my daily development routine. but changed nothing.

**Core Objectives:**
To enhance my personal learning efficiency, practice "VibeCoding"(that changed nothing but reducing my coding ability), and serve as a self-made replacement for external tools like Gemini CLI and Copilot. (didnt make it.)

---

## ✨ Key Features

### 1. Hybrid Toolchain & Agent Architecture

- **MCP Support**: The system supports the **Model Context Protocol (MCP)** for tools, allowing for potential network-based functions (though DeepSeek requires careful prompting to prevent excessive tool usage).
- **Native Tools**: To avoid the latency of `npx` and external MCP servers, core functions like `read_file`, `write_file`, and `run_command` are implemented **natively** within the extension.
- **Extensibility**: The `mcpHost` architecture remains in place, allowing for seamless future integration of external MCP servers (e.g., dedicated search, database tools).

### 2. TUI Style and Interaction (The Look)

- **Visuals**: **Crudely mimics** the aesthetic of Gemini CLI and ClaudeCode, aiming for a consistent, terminal-style user experience. (didnt make this, too)
- **Streaming Output**: Utilizes the DeepSeek API's streaming functionality for a relatively smooth, real-time output experience.
- **Reasoning Stream**: The AI's **reasoning process** is visible, which helps to mitigate decision-making errors by providing transparency.
- **Key Operations (Copilot Imitation)**:
    - **Click-to-Insert**: Implemented a function to quickly insert AI-provided code snippets into the editor at the cursor position.
    - **Diff Comparison**: Achieves a basic **red/green diff comparison** via the `vscode.diff` command (A **humble approximation** of the true inline Copilot experience, which I could not fully reproduce).

### 3. Workflow and Data Management

- **File System Initialization**: The `initializeWorkspace` function automatically creates the structured directory system (`codes`, `notes`, `reviews`, etc.) upon opening a new workspace.
- **Context Persistence**: Dialogue history is stored via **local JSON file I/O**, ensuring the chat context is retained even after restarting the IDE.

---

## ⚠️ Known Issues and Limitations

- **Agent Performance/Bias**: The AI's responsiveness and stability are inherently limited by the DeepSeek API's access speed and tendency towards excessive tool usage.
- **Diff Limitation**: The current Diff function is **external** (opens a side-by-side view) and lacks complex **inline replacement** functionality. (This is the feature I most wanted to implement.)
- **Bugs/Error Handling**: Due to the experimental nature of the project and the developer's limited technical background, **the codebase likely contains undiscovered bugs** that may cause unexpected failures.
- **Provider Status**: The `Gemini` provider option is currently unimplemented, though the architecture is ready.

---

## ⚙️ Extension Settings

This extension contributes the following settings via `contributes.configuration`:

*   `opengravity.provider`: Selects the Large Language Model provider (`deepseek` is currently functional; `gemini` is unimplemented).
*   `opengravity.apiKey`: Your API Key.

## 🚀 Getting Started

1.  **Install**: Install the extension via VSIX file.
2.  **Configure**: Search for `Opengravity` in VS Code settings and input your API Key.
3.  **Initialize**: Open a folder; the extension will prompt you to initialize the necessary file structure.
4.  **Use**: Open the sidebar and begin your dialogue.
