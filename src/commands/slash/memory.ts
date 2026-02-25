import { ICommand, CommandContext, CommandResult } from '../ICommand';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TemplateManager } from '../../utils/templateManager';

/**
 * MemoryCommand: 长期记忆管理指令 (Kernel)
 */
export class MemoryCommand implements ICommand {
    name = 'memory';
    description = '管理 AI 长期记忆 (show, add, refresh)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const subCommand = args[0]?.toLowerCase();
        switch (subCommand) {
            case 'show': return await this.handleShow(context);
            case 'add': return await this.handleAdd(args.slice(1), context);
            case 'refresh': return await this.handleRefresh(context);
            default: return { status: 'error', message: '子命令: /memory [show|add|refresh]' };
        }
    }

    private async handleShow(context: CommandContext): Promise<CommandResult> {
        const systemPath = this.getSystemMdPath();
        if (!systemPath) return { status: 'error', message: '❌ 未找到工作区。' };

        try {
            const content = await fs.promises.readFile(systemPath, 'utf-8');
            const rawTemplate = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/memory_view.md');
            const msg = await TemplateManager.render(rawTemplate, { content });

            await context.webview.postMessage({ type: 'aiResponse', value: msg });
            return { status: 'success' };
        } catch (e) {
            return { status: 'error', message: '❌ 无法读取 SYSTEM.md' };
        }
    }

    private async handleAdd(args: string[], context: CommandContext): Promise<CommandResult> {
        const text = args.join(' ');
        if (!text) return { status: 'error', message: '内容缺失: /memory add <text>' };

        const systemPath = this.getSystemMdPath();
        if (!systemPath) return { status: 'error', message: '❌ 未找到工作区。' };

        try {
            let content = await fs.promises.readFile(systemPath, 'utf-8');
            const memorySection = '## 🧠 开发约定 (Memories)';
            content = content.includes(memorySection) ? content.replace(memorySection, `${memorySection}\n- ${text}`) : content + `\n\n${memorySection}\n- ${text}`;

            await fs.promises.writeFile(systemPath, content, 'utf-8');
            if (context.chatViewProvider?.refreshSystemPrompt) await context.chatViewProvider.refreshSystemPrompt();

            return { status: 'success', message: `✅ 记忆已添加：\n> ${text}` };
        } catch (e) {
            return { status: 'error', message: '❌ 添加失败' };
        }
    }

    private async handleRefresh(context: CommandContext): Promise<CommandResult> {
        const provider = context.chatViewProvider;
        if (provider && provider.refreshSystemPrompt) {
            try {
                await provider.refreshSystemPrompt();
                await context.webview.postMessage({
                    type: 'aiResponse',
                    value: '✅ **热重载成功**：系统提示词已根据 `.opengravity/SYSTEM.md` 完成刷新。'
                });
                return { status: 'success' };
            } catch (e: any) {
                return { status: 'error', message: `刷新失败: ${e.message}` };
            }
        }
        return { status: 'error', message: '❌ 内部错误：无法获取刷新接口。' };
    }

    private getSystemMdPath(): string | undefined {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return root ? path.join(root, '.opengravity', 'SYSTEM.md') : undefined;
    }
}
