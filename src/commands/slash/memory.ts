import { ICommand, CommandContext, CommandResult } from '../ICommand';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * MemoryCommand: 长期记忆管理指令
 * 操作 .opengravity/GEMINI.md 文件，管理 AI 的系统上下文
 */
export class MemoryCommand implements ICommand {
    name = 'memory';
    description = '管理 AI 长期记忆 (show, add, refresh)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'show':
                return await this.handleShow(context);
            case 'add':
                return await this.handleAdd(args.slice(1), context);
            case 'refresh':
                return await this.handleRefresh(context);
            default:
                return { status: 'error', message: '请指定子命令: /memory [show|add|refresh]' };
        }
    }

    private async handleShow(context: CommandContext): Promise<CommandResult> {
        const geminiPath = this.getGeminiPath();
        if (!geminiPath) return { status: 'error', message: '❌ 未找到工作区。' };

        try {
            const content = await fs.promises.readFile(geminiPath, 'utf-8');
            const msg = [
                "### 🧠 当前项目记忆 (GEMINI.md)",
                "",
                "```markdown",
                content,
                "```"
            ].join('\n');

            await context.webview.postMessage({
                type: 'aiResponse',
                value: msg
            });
            return { status: 'success' };
        } catch (e) {
            return { status: 'error', message: '❌ 无法读取 GEMINI.md，请先运行 `/init`。' };
        }
    }

    private async handleAdd(args: string[], context: CommandContext): Promise<CommandResult> {
        const text = args.join(' ');
        if (!text) return { status: 'error', message: '请输入要添加的记忆内容: /memory add <text>' };

        const geminiPath = this.getGeminiPath();
        if (!geminiPath) return { status: 'error', message: '❌ 未找到工作区。' };

        try {
            let content = await fs.promises.readFile(geminiPath, 'utf-8');
            const memorySection = '## 🧠 开发约定 (Memories)';
            
            if (content.includes(memorySection)) {
                content = content.replace(memorySection, `${memorySection}\n- ${text}`);
            } else {
                content += `\n\n${memorySection}\n- ${text}`;
            }

            await fs.promises.writeFile(geminiPath, content, 'utf-8');
            
            // 自动刷新
            if (context.chatViewProvider && context.chatViewProvider.refreshSystemPrompt) {
                await context.chatViewProvider.refreshSystemPrompt();
            }

            return { status: 'success', message: `✅ 记忆已添加并同步：\n> ${text}` };
        } catch (e) {
            return { status: 'error', message: '❌ 添加记忆失败，请检查 GEMINI.md 是否存在。' };
        }
    }

    private async handleRefresh(context: CommandContext): Promise<CommandResult> {
        const provider = context.chatViewProvider;
        if (provider && provider.refreshSystemPrompt) {
            await provider.refreshSystemPrompt();
            return { status: 'success' };
        }
        return { status: 'error', message: '❌ 内部错误：无法获取刷新接口。' };
    }

    private getGeminiPath(): string | undefined {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return root ? path.join(root, '.opengravity', 'GEMINI.md') : undefined;
    }
}
