/**
 * ## extension.ts - Opengravity 启动
 * # EXPLAINATION:
 * 主要通过这个启动Opengravity插件，可以初始化工作区，启动MCP，注册侧边栏...
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChatViewProvider } from './chatViewProvider';
import { AIProvider, DeepSeekProvider, GeminiProvider } from './provider';
import { McpHost } from './mcp/mcpHost';
import { loadSystemPrompt } from './utils/promptLoader';

/**
 * mcp和系统提示词
 */

let mcpHost: McpHost | undefined;
let globalSystemPrompt: string = "";

/**
 * ## 初始化工作区
 */

async function initializeWorkspace() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    const configDir = path.join(rootPath, '.opengravity');

    const OPGV_SYSTEM_PROMPT = `# SYSTEM PROMPT: Opengravity

## I. 身份与环境
- **身份**: 你是集成在 VSCodium 中的先进 AI 开发助手 **Opengravity**。
- **人格**: 专业高效（TARS）+ 禅意哲理（乌龟大师）。语气简洁，偶尔幽默。
- **语言**: 你的响应**必须**使用**中文**。
- **目录结构**: \`codes\`, \`reviews\`, \`notes\`, \`daily\`, \`brainstorm\`, \`todo\`。
- **权限**: 对 \`codes\`, \`notes\`, \`daily\` 仅读；对 \`reviews\`, \`brainstorm\`, \`todo\` 可读写。

## II. 命令协议与工具使用
你被赋予了使用工具（\`read_file\`、\`write_file\`、\`run_command\`）的权利。当收到命令时，你必须制定使用这些工具来满足请求的计划。

### 1. 命令：\`-codereview <路径>\`
- **逻辑**: 读取 \`codes/\` 文件 -> 分析 Bug/逻辑/性能 -> 写入 \`reviews/review-[文件名].md\`。
- **要求**: C 语言必须建议修改为 **Linux 内核编码风格**。

### 2. 命令：\`-brainstorm <路径>\`
- **逻辑**: 读取 \`notes/\` 或 \`daily/\` -> 发散思考 -> 写入 \`brainstorm/brainstorm-[文件名].md\`。
- **输出格式**: 使用 Mermaid.js 格式绘制脑图。

### 3. 命令：\`good morning\` (每日简报)
- **逻辑**: \`run_command\` 查找 \`daily/\` 最新日志 -> 提取待办 -> \`write_file\` 至 \`todo/YYYY-MM-DD-todo.md\`。

## III. 工具使用策略 (Tool Use Policy)

**[准则]**: 如果问题不涉及实时信息或文件，你**必须**尝试用自有知识回答。

**[规则 1: 优先内部知识]**: 仅在无工具必要时，才直接回答。
**[规则 2: 明确意图]**: 只有明确意图（如"审查文件"）才应考虑使用工具。
**[规则 3: 避免小题大做]**: 禁止使用 \`run_command\` 执行简单计算。

## IV. 响应规范
- 输出必须是结构化的 Markdown。
- 保持冷静、智慧、不做无谓的寒暄。
`;
    const MCP_CONFIG_CONTENT = {
        "mcpServers": {
            "search": {
                "command": "npx",
                "args": [
                    "-y",
                    "@modelcontextprotocol/server-brave-search"
                ],
                "env": {
                    "MODE": "stdio",
                    "DEFAULT_SEARCH_ENGINE": "bing",
                    "ALLOWED_SEARCH_ENGINES": "duckduckgo,bing,exa"
                }
            }
        }
    };


    if (!fs.existsSync(configDir)) {
        const selection = await vscode.window.showInformationMessage(
            '[✍️]Opengravity: 是否初始化工作区结构? | Initialize your workspace?', 'ACPT', 'RJCT'
        );
        if (selection === 'ACPT') {
            try {
                ['.opengravity','daily','codes','notes','todo','brainstorm','reviews'].forEach(f => {
                    const p = path.join(rootPath, f);
                    if (!fs.existsSync(p)) {
                        fs.mkdirSync(p, { recursive: true });
                    }
                });
                const sysPromptPath = path.join(configDir, 'SYSTEM.md');
                fs.writeFileSync(sysPromptPath, OPGV_SYSTEM_PROMPT);

                const mcpPath = path.join(configDir, 'mcp_config.json');
                fs.writeFileSync(mcpPath, JSON.stringify(MCP_CONFIG_CONTENT, null, 2));


                vscode.window.showInformationMessage('Initialized! 🚀');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Init failed: ${error.message}`);
            }
        }
    }
}

/**
 * ## 激活扩展
 */

export async function activate(context: vscode.ExtensionContext) {
    console.log('[CHECK] Opengravity is now active!');
    await initializeWorkspace();

    globalSystemPrompt = await loadSystemPrompt();

    mcpHost = new McpHost();
    await mcpHost.startup();

    const getAIProvider = (): AIProvider | null => {
        const config = vscode.workspace.getConfiguration('opengravity');
        const apiKey = config.get<string>('apiKey');
        if (!apiKey) {
            return null;
        }
        return new DeepSeekProvider(apiKey);
    };

    const sidebarProvider = new ChatViewProvider(context.extensionUri, getAIProvider, mcpHost!, globalSystemPrompt);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, sidebarProvider)
    );

    context.subscriptions.push(vscode.commands.registerCommand('opengravity.showDiff', async (aiCode: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const aiDoc = await vscode.workspace.openTextDocument({ content: aiCode, language: editor.document.languageId });
        await vscode.commands.executeCommand('vscode.diff', editor.document.uri, aiDoc.uri, 'Diff View');
    }));
}

export function deactivate() {}