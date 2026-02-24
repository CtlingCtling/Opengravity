## 🚀 Next Up: 阶段性目标 (核心能力演进)

- [x] **Phase 3: 全面支持 MCP (Tools, Prompts, Resources)** @priority:critical
- [x] **Phase 4: 工业级稳定性保障 (完善测试覆盖)** @priority:high
- [x] **Phase 5: 完整指令功能系统 (Command Power-user)** @priority:critical

- [x] **Phase 5.1: 技能系统** @priority:high
  - [x] **构建Skills系统**: 在.opengravity/中创建skills/文件夹，其中放入不同的技能模板，可以和commands联动调用
  - [x] **TOML自定义指令**: 完善指令注册与动态加载逻辑。

- [x] **Phase 6: 代码修改系统** @priority:high
  - [x] **增量代码修改 (Surgical Edits)**: 实现基于 `old_string/new_string` 的精准局部修改。
  - [x] **Inline Diff 深度集成**: 编辑器标题栏“勾/叉”审批按钮与 VSCode Context 联动。
  - [x] **Recursion Defense**: 基于协议自愈的历史记录扫描，彻底拦截循环调用。

- [x] **Phase 7: 命令行执行系统 (Streaming Shell)** @priority:critical
  - [x] **实现流式执行**: 基于 `spawn` 的实时终端反馈，支持 ANSI 彩色渲染。
  - [x] **Xcode/TUI 风格 UI**: 深邃背景、等宽字体、视图隔离架构（防止 Markdown 覆盖终端）。
  - [x] **安全性加固**: 危险指令拦截与模态确认逻辑。

- [ ] **Phase 8: 自适应项目感知 (`/scan`)** @priority:high
  - [ ] **复杂度初评逻辑**: 自动判定“脚本模式”或“工程模式”。
  - [ ] **生成 Project Map**: 建立单一事实来源 `.opengravity/PROJECT_MAP.md`。
  - [ ] **蓝图建模 (Blueprint)**: 自动生成文件夹/模块关联的 **Mermaid 流程图**。
  - [ ] **知识图谱建模 (Knowledge Graph)**: 提取符号、类、概念，生成 **Mermaid 思维导图**。
  - [ ] **意图与生命周期对齐**: 结合 Git 状态与对话历史提取“当前关注点”。
  - [ ] **自调节 Context**: Agent 根据 PROJECT_MAP 自动切换“助教模式”或“架构师模式”。

---

## 🏗️ [CORE] 核心架构演进

---

### 💡 [IDEAS] 灵感与进阶功能

#### 🧠 智能上下文与记忆 (Context & Memory)
- [ ] **上下文修剪 (Context Pruning)**: 已被 `/compress` 实现。
- [ ] **短期记忆 (Action-Result Summary)**: 工具调用后的结构化自省，辅助连续决策。
- [ ] **长期记忆搜索**: 对话历史的语义检索。

#### 🛠️ 开发者体验与扩展 (DX & Extensibility)
- [ ] **热重载配置**: 监听 `.opengravity/` 变化实时生效。
- [ ] **多角色切换**: UI 顶部快速切换“架构师”等角色。

#### 🔒 安全与隔离 (Sandbox)
- [ ] **Phase 7.2: 沙箱模式**: 基于 `docker run` 进行隔离执行，保护宿主机安全。

#### ⚙️ 自维护提示词 (Self-Maintenance Prompts) @priority:future
- [ ] **Prompt 自我优化**: AI 能够基于反馈迭代优化自身的 `PROJECT_MAP` 或 Agent 提示词。
- [ ] **行为模式调整**: 在人类审核的前提下，AI 能够选择性地修改自己的行为协议。

#### 📥 灵感吞噬引擎 (Inspiration Ingestion)
- [ ] **全渠道抓取**: 支持 `/ingest <url>`，自动转译为 AI 可读内容。

#### 👁️ 交互与可观察性 (UI & Observability)
- [ ] **工具执行流式状态**: 实时展示 MCP 工具耗时。
- [ ] **CoT 视图优化**: 更精美的思考链路展示。

#### 🎯 AI 逻辑精化 (AI Logic)

#### 🧭 可发展方向
- [ ] **A2A 协议**: 对标谷歌 A2A-server，实现 Agent 间的标准化协作。
