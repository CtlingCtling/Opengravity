## 🚀 Next Up: 阶段性目标 (核心能力演进)

### 🏁 Phase: Version Zero (MVP Polish) @priority:critical [COMPLETED]
- [x] **初始化逻辑重构 (Init 2.0)**:
  *   **工作区预检**: 若无 `.opengravity` 文件夹，Webview 显示“未 选定 Opengravity 工作区”。
  *   **延迟同步**: 在运行 `/init` 之前，不自动粘贴 skill 和 toml 文件。
- [x] **内存压缩系统 (Advanced Compression)**:
  *   **State Snapshot**: 借鉴 Gemini CLI，将 `/compress` 升级为结构化 XML 快照。
- [x] **时间感知增强**:
  *   **主动查询**: 实现 `get_time` 机制，让 Opengravity 随时拥有 时间观念（非仅依赖心跳注入）。
- [x] **冗余清理**: 找到并彻底移除 `agents/code_reviewer.md` 及其 关联逻辑。
- [x] **交互验证**: 确认 `read_file` 免审批逻辑已实现且具有视觉反 馈。
- [x] **IntelliSense**: 
- [x] **品牌与文档**: 
  *   [ ] **Icon**: 为 Opengravity 寻找/设计一个精致的图标。
  *   [x] **README**: 撰写详细的技术架构说明与操作指南。
  *   [x] **License**: 添加 MIT 授权协议。

---

- [x] **Phase 3: 全面支持 MCP (Tools, Prompts, Resources)** @priority:critical
- [x] **Phase 4: 工业级稳定性保障 (完善测试覆盖)** @priority:high
- [x] **Phase 5: 完整指令功能系统 (Command Power-user)** @priority:critical

- [x] **Phase 6: 代码修改系统** @priority:high
  - [x] **增量代码修改 (Surgical Edits)**: 实现基于 `old_string/new_string` 的精准局部修改。
  - [x] **Inline Diff 深度集成**: 编辑器标题栏“勾/叉”审批按钮与 VSCode Context 联动。
  - [x] **Recursion Defense**: 基于协议自愈的历史记录扫描，彻底拦 截循环调用。

- [x] **Phase 7: 命令行执行系统 (Streaming Shell)** @priority:critical
  - [x] **实现流式执行**: 基于 `spawn` 的实时终端反馈，支持 ANSI  彩色渲染。
  - [x] **Xcode/TUI 风格 UI**: 深邃背景、等宽字体、视图隔离架构。
  - [x] **安全性加固**: 危险指令拦截与模态确认逻辑。

- [x] **Phase 8: 项目感知与提示词工程 (The Awareness Leap)** @priority:critical
  - [x] **自适应 /scan 逻辑**: 自动判定 SCRIPT/ENGINEERING 模式。
  - [x] **动态地图建模**: 生成包含 Blueprint (Mermaid Flow) 和符号图谱的 `PROJECT_MAP.md`。
  - [x] **系统提示词动态合成**: 实现 Agent 根据地图内容自动调整其“思考深度”与“专业角色”。
  - [x] **提示词解耦优化**: 完善 `assets/templates/` 体系，确保逻 辑与数据的极致分离。

- [x] **Phase 9: 发布冲刺 (Release v0.1.0 Polish)** @priority:high [RELEASED]
  - [x] **交互细节打磨**: 实现指令 IntelliSense 提示与语法高亮。
  - [ ] **DeepSeek v4 适配**: 针对新模型特性优化推理引导提示词。
  - [ ] **演示案例准备**: 准备一套针对复杂项目的“架构感知”技术演示流程。
  - [x] **版本管理**: 升级至 v0.1.0 并完善 License。

- [ ] **Phase 10: 意图哨兵 (Architectural Sentry)** @priority:medium

  - [ ] **意图预检层**: 在行动前强制 AI 进行架构一致性校验。

- [ ] **Phase 11: 任务自主与生命节律 (Autonomy & Heartbeat)** @priority:medium
  - [ ] **`/auto` 指令**: 开启自主执行循环，允许 Agent 独立完成已规划的连续任务。
  - [ ] **`/explore` 指令**: 激发好奇心引擎，利用联网 MCP 进行自主调研与知识发现。
  - [ ] **Heartbeat 引擎**: 实现基于定时器的静默注入机制，周期性唤醒 Opengravity 进行环境感知。
  - [ ] **状态机集成 (`/shutup`)**: 增加 `is_automatic` 状态锁，精确控制主动发言权限与协议注入。
  - [ ] **建立自检协议**: 创建 `HEARTBEAT.md` 模板，定义 Opengravity 在心跳触发时的观察清单与决策边界。
  - [ ] **安全围栏**: 为自主模式设置资源配额与人工强断开关。

---

## 🏗️ [CORE] 核心架构演进

- [x] **提示词工程 (Prompt Engineering)**: 已并入 Phase 8 协同演进。
- [ ] **多端抽象层**: 为将来可能的 CLI/App 转化预留 Logic-UI 分离接口。

---

### 💡 [IDEAS] 灵感与进阶功能

#### 🧠 智能上下文与记忆 (Context & Memory)
- [x] **上下文修剪 (Context Pruning)**: 已被 `/compress` 实现。
- [ ] **短期记忆 (Action-Result Summary)**: 工具调用后的结构化自省。
- [ ] **长期记忆搜索**: 对话历史的语义检索。

#### 🛠️ 开发者体验与扩展 (DX & Extensibility)
- [ ] **热重载配置**: 监听 `.opengravity/` 变化实时生效。
- [ ] **多角色快速切换**: UI 顶部角色选择。

#### 🔒 安全与隔离 (Sandbox)
- [ ] **Phase 7.2: 沙箱模式**: 基于 `docker run` 进行隔离执行。

#### ⚙️ 自维护提示词 (Self-Maintenance Prompts) @priority:future
- [ ] **Prompt 自我优化**: AI 能够基于反馈迭代优化自身的提示词资产。

#### 🧭 可发展方向
- [ ] **A2A 协议**: 实现 Agent 间的标准化协作。
