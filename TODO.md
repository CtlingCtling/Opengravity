## 🚀 Next Up: 阶段性目标 (核心能力演进)

- [x] **Phase 3: 全面支持 MCP (Tools, Prompts, Resources)** @priority:critical
- [x] **Phase 4: 工业级稳定性保障 (完善测试覆盖)** @priority:high
- [x] **Phase 5: 完整指令功能系统 (Command Power-user)** @priority:critical

- [x] **Phase 5.1: 技能系统** @priority:high
  - [x] **构建Skills系统**: 在.opengravity/中创建skills/文件夹，其中放入不同的技能模板，可以和commands联动调用
  - [x] **TOML自定义指令**: 我们是否已经完成自定义指令系统的开发？

- [x] **Phase 6: 代码修改系统** @priority:high
  - [x] **增量代码修改 (Surgical Edits)**: 实现基于 `old_string/new_string` 的精准局部修改，提升大文件修改稳定性。 @priority:high
  - [x] **Inline Diff 深度集成**: 编辑器内“一键采纳/拒绝”按钮。 @priority:high
  - [x] **recursion bug fixing**

- [ ] **Phase 7: 命令行执行系统** @priority:high
  - [x] **实现命令执行**: 参考GeminiCLI解决方案
  - [ ] **实现沙箱模式**: 针对危险的 Shell 操作提供受限环境。

- [ ] **Phase 8: 新增功能/scan自动提示词** @priority:high
  - [ ] **`/scan` 指令**: 自动扫描当前项目技术栈，识别框架并生成初始 `.opengravity/agents/<技术栈名称>.md` 规范。
  - [ ] **热重载配置**: 监听 `.opengravity/` 变化实时生效。
  - [ ] **多角色切换**: UI 顶部快速切换“架构师”等角色。
  - [ ] **模糊化调用 (Intent-Driven Prompts)**: 允许 AI 描述意图，系统自动匹配最合适的 MCP Prompt 模板。 @priority:medium
    - 方案描述：通过.opengravity/中的文件 index.md 分块简短描述各种 MCP Prompt ，Skills 和 /scan 中生成的技术栈模板，进行匹配

- [ ] **基础功能优化** @priority:high
  - [ ] **工作流路径自定义**: 支持用户指定配置存储位置。

- [ ] **UI 核心体验优化 (按需简化)** @priority:low
  - [ ] **Markdown 深度渲染**: 修复代码块、表格显示，对齐专业体感。

---

## 🏗️ [CORE] 核心架构演进

---

### 💡 [IDEAS] 灵感与进阶功能

#### 🧠 智能上下文与记忆 (Context & Memory)
- [ ] **上下文修剪 (Context Pruning)**: 自动管理 Token 窗口，通过摘要防止溢出。 @priority:high
已经被/compress实现
- [ ] **短期记忆 (Action-Result Summary)**: 工具调用后的结构化自省，辅助连续决策。 @priority:medium
需要详细定义这个功能
- [ ] **长期记忆搜索**: 对话历史的语义检索。
需要详细定义这个功能

#### 🛠️ 开发者体验与扩展 (DX & Extensibility)

#### 📥 灵感吞噬引擎 (Inspiration Ingestion Engine) @priority:low
- [ ] **全渠道内容抓取 (Reference Eden)**: 支持 `/ingest <url>`，自动转译为 AI 可读内容。 @priority:low
- [ ] **多媒体转译逻辑**: 视频链接 -> 自动转录 -> 智能摘要。 @priority:low
- [ ] **灵感集中化管理**: 让碎片化想法能被 AI 实时引用。 @priority:low

#### 👁️ 交互与可观察性 (UI & Observability)
- [ ] **工具执行状态流式显示**: 实时展示 MCP 工具耗时与进度。 @priority:medium
- [ ] **可观察性面板 (Chain of Thought)**: AI 思考链路的实时视图。
- [ ] **Tokens消耗查询**

#### 🎯 AI 逻辑精化 (AI Logic)

#### 🧭 可发展方向
- [ ] A2A协议 （高回报，需要关注）