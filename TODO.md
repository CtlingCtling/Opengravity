## 🚀Next Up
- [x] 2.2提示词外部化配置 @priority:high
    - [x] 1. 创建 `assets/templates` 目录。
    - [x] 2. 将 `OPGV_SYSTEM_PROMPT` 等大型字符串内容移至 `assets/templates/SYSTEM.md` 等模板文件中。
    - [x] 3. 修改 `initializeWorkspace` 函数，使其从模板文件复制内容到用户工作区（`.opengravity/`），而非写入硬编码字符串。
- **验证**: 系统提示词现在从 `.opengravity/SYSTEM.md` 加载，用户可直接修改该文件来调整 AI 行为。

- [x] 3.1重构函数 `handleUserMessage` @priority:high

- [ ] 3.2全面异步化函数 @priority:high

- [ ] 4.1引入单元化测试 @priority:high
    - [ ] 引入 `ts-jest` 或 `mocha` 环境
    - [ ] 编写首个针对 `provider.ts` 的 Mock 测试

- [ ] 4.2实现日志系统 @priority:high

---

## \[CORE\]:
- [ ] 可以加载mcp中的tool，但是无法加载prompt。目标：完整适配mcp  @priority:high
- [ ] 参考GeminiCLI源代码，做到inline diff，和.gemini配置文件中相似功能  @priority:low
- [ ] 拥有简单的命令系统（和GeminiCLI相似） @priority:low
- [ ] 支持用户自定义命令 @priority:low
- [ ] 实现沙箱模式 @priority:low
- [ ] 工作流文件夹可自定义 @priority:high

## \[UI\]:
- [ ] 在模型输出对话的时候不能上下滑动，被锁定。目标：随意上下滑动 @priority:high
- [ ] 目前：markdown语法输出存在一定问题，有些不显示，目标：完整适配md  @priority:high
- [ ] 主题同步（gemini好想法） @priority:low

## \[DX\]:
- [ ] 外部化配置（进行中） @priority:high
- [ ] 日志系统 @priority:high
- [ ] 单元测试覆盖 @priority:high

## \[IDEAS\]:
- [ ] **多角色切换**：在 UI顶部增加下拉框，快速切换不同的系统提示词（如：代码审查者、架构师、单元试生成器）。
- [ ] **上下文修剪**：当对话过长时，自动汇总历史记录，以节省 Token并保持响应速度。
- [ ] **热重载配置**：监听 `.opengravity/` 下文件的变化，无需重启 VSCode 即可生效新提示词。