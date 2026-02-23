## 🚀 Next Up: 阶段性目标 (指令系统攻坚)

- [x] **Phase 3: 全面支持 MCP (Tools, Prompts, Resources)** @priority:critical
- [x] **Phase 4: 工业级稳定性保障 (完善测试覆盖)** @priority:high
- [ ] **Phase 5: 完整指令功能系统 (Command Power-user)** @priority:critical
  - [x] **1. 核心架构与符号分发**: 实现 `/`, `@`, `!` 路由及高级正则路径解析。
  - [ ] **2. 会话管理系统 (`/chat`)**: 
    - [ ] `/chat save <tag>`: 保存当前对话快照。
    - [ ] `/chat list`: 列出本地已保存的会话。
    - [ ] `/chat resume <tag>`: 恢复历史会话状态。
    - [ ] `/chat delete <tag>`: 删除已经保存的检查点。
    - [ ] `/chat share`: 将对话导出为 Markdown。
  - [ ] **3. 系统与协议扩展 (`/mcp`, `/commands`)**:
    - [x] `/commands`: 列出所有已加载指令。
    - [ ] `/commands reload`: 热重载 TOML 指令。
    - [ ] `/mcp list/refresh`: 管理 MCP 连接状态。
    - [ ] `/tools`: 显示 AI 可调用的原子能力。
  - [ ] **4. 记忆与项目初始化 (`/init`, `/memory`)**:
    - [ ] `/init`: 自动扫描并生成项目 `GEMINI.md` 规范。
    - [ ] `/memory add/refresh`: 动态管理系统提示词背景。
    - [ ] `/compress`: 智能上下文摘要。
  - [x] **5. 符号指令深度实现**:
    - [x] `@path`: 自动注入文件/目录内容（Git-Aware）。
    - [x] `!cmd`: 安全终端直通并同步 AI。
- [ ] **UI 核心体验优化** @priority:high
  - [ ] **滚动锁定修复**: 解决输出流式显示时的页面锁定问题。
  - [ ] **Markdown 深度渲染**: 修复代码块、表格显示，对齐专业体感。
- [ ] **基础功能优化** @priority:high
  - [ ] **工作流路径自定义**: 支持用户指定配置存储位置。

---

## 🏗️ [CORE] 核心架构演进
- [ ] **构建技能系统**: 内置指令与自定义 TOML 命令的统一管理。 @priority:high
- [ ] **增量代码修改 (Surgical Edits)**: 基于 `old_string/new_string` 的精准局部修改。 @priority:high
- [ ] **实现沙箱模式**: 针对危险的 Shell 操作提供受限环境。 @priority:low

---

### 💡 [IDEAS] 灵感与进阶功能

#### 📥 灵感吞噬引擎 (Inspiration Ingestion Engine)参考：Eden
- [ ] **全渠道内容抓取 (Reference Eden)**: 支持粘贴网址，自动转译为 AI 可读内容。 @priority:high
- [ ] **多媒体转译逻辑**: 视频链接 -> 自动转录 -> 智能摘要。 @priority:medium
- [ ] **灵感集中化管理**: 让碎片化想法能被 AI 实时引用。 @priority:medium

#### 🧠 智能上下文与记忆 (Context & Memory)
- [ ] **上下文修剪 (Context Pruning)**: 自动管理 Token 窗口。 @priority:high
- [ ] **短期记忆 (Action-Result Summary)**: 工具调用后的结构化自省。 @priority:medium
- [ ] **长期记忆搜索**: 对话历史的语义检索。

### 🛠️ 开发者体验与扩展 (DX & Extensibility)
- [ ] **热重载配置**: 监听 `.opengravity/` 变化实时生效。 @priority:high
- [ ] **多角色切换**: UI 顶部快速切换“架构师”等角色。 @priority:medium

### 👁️ 交互与可观察性 (UI & Observability)
- [ ] **工具执行状态流式显示**: 实时展示 MCP 工具耗时与进度。 @priority:medium
- [ ] **可观察性面板 (Chain of Thought)**: AI 思考链路的实时视图。
- [ ] **Inline Diff 深度集成**: 编辑器内“一键采纳/拒绝”按钮。

### 🎯 AI 逻辑精化 (AI Logic)
- [ ] **模糊化调用 (Intent-Driven Prompts)**: 允许 AI 描述意图，系统自动匹配最合适的 MCP Prompt 模板。 @priority:medium
- [ ] **增量替换逻辑优化**: 强化对长文件修改的稳定性，避免 AI 全量重写导致的信息丢失。 @priority:high