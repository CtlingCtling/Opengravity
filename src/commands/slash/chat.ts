import { ICommand, CommandContext, CommandResult } from '../ICommand';
import * as vscode from 'vscode';

/**
 * ChatCommand: 会话管理指令集
 * 包含 save, list, resume, delete, share功能
 */
export class ChatCommand implements ICommand {
    name = 'chat';
    description = '会话管理 (save, list, resume, delete, share)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'save':
                return await this.handleSave(args.slice(1), context);
            case 'list':
                return await this.handleList(context);
            case 'resume':
                return await this.handleResume(args.slice(1), context);
            case 'delete':
                return await this.handleDelete(args.slice(1), context);
            case 'share':
                return await this.handleShare(args.slice(1), context);
            default:
                return { 
                    status: 'error', 
                    message: '请指定子命令: /chat [save|list|resume|delete|share]' 
                };
        }
    }

    private async handleSave(args: string[], context: CommandContext): Promise<CommandResult> {
        const tag = args[0];
        if (!tag) { return { status: 'error', message: '请指定保存标签: /chat save <tag>' }; }

        const success = await context.chatHistoryService.saveCheckpoint(tag, context.historyManager.getHistory());
        if (success) {
            return { status: 'success', message: `✅ 会话快照已保存: ${tag}` };
        }
        return { status: 'error', message: `❌ 保存失败，请检查日志。` };
    }

    private async handleList(context: CommandContext): Promise<CommandResult> {
        const checkpoints = await context.chatHistoryService.listCheckpoints();
        if (checkpoints.length === 0) {
            return { status: 'success', message: '📅 目前没有任何保存的会话快照。' };
        }

        let msg = '📂 **已保存的会话快照:**\n\n';
        checkpoints.forEach(cp => {
            const date = new Date(cp.timestamp).toLocaleString();
            msg += `- **${cp.tag}** (保存于: ${date})\n`;
        });
        msg += '\n使用 `/chat resume <tag>` 恢复。';

        return { status: 'success', message: msg };
    }

    private async handleDelete(args: string[], context: CommandContext): Promise<CommandResult> {
        const tag = args[0];
        if (!tag) { return { status: 'error', message: '请指定要删除的标签: /chat delete <tag>' }; }

        const success = await context.chatHistoryService.deleteCheckpoint(tag);
        if (success) {
            return { status: 'success', message: `🗑️ 会话快照已删除: ${tag}` };
        }
        return { status: 'error', message: `❌ 删除失败。` };
    }

    private async handleResume(args: string[], context: CommandContext): Promise<CommandResult> {
        const tag = args[0];
        if (!tag) { return { status: 'error', message: '请指定要恢复的标签: /chat resume <tag>' }; }

        // 1. 安全确认：告知用户 KV Cache 将丢失
        const confirm = await vscode.window.showWarningMessage(
            `[⚠️] 确认恢复会话 "${tag}"?
恢复后，当前对话的 KV Cache (上下文缓存) 将丢失，模型性能将重置。`,
            { modal: true },
            '确认恢复'
        );

        if (confirm !== '确认恢复') {
            return { status: 'intercepted', message: '用户取消了恢复。' };
        }

        // 2. 加载数据
        const data = await context.chatHistoryService.loadCheckpoint(tag);
        if (!data) { return { status: 'error', message: `❌ 找不到快照: ${tag}` }; }

        // 3. 更新内存状态
        context.historyManager.loadHistory(data.history);

        // 4. 同步 Webview UI (清空并重新渲染)
        context.webview.postMessage({ type: 'clearView' });
        
        const displayHistory = data.history
            .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
            .map(m => ({ 
                role: m.role === 'assistant' ? 'ai' : 'user', 
                content: m.content || "" 
            }));
        
        context.webview.postMessage({ type: 'restoreHistory', value: displayHistory });

        return { status: 'success', message: `🔄 已恢复会话快照: ${tag}` };
    }

    private async handleShare(args: string[], context: CommandContext): Promise<CommandResult> {
        const history = context.historyManager.getHistory();
        if (history.length === 0) {
            return { status: 'error', message: '❌ 当前没有任何对话内容可导出。' };
        }

        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!rootPath) { return { status: 'error', message: '❌ 未打开工作区，无法保存文件。' }; }

        const reviewsDir = vscode.Uri.joinPath(context.extensionUri, '..', '..', 'reviews').fsPath; // 向上跳转寻找主目录下的 reviews
        // 注意：在 VSCode 扩展中，通常建议保存到工作区目录
        const targetDir = require('path').join(rootPath, 'reviews');
        const fileName = args[0] || `share_${Date.now()}.md`;
        const filePath = require('path').join(targetDir, fileName.endsWith('.md') ? fileName : `${fileName}.md`);

        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(targetDir));
            
            let markdown = `# Opengravity Chat Export\n\nDate: ${new Date().toLocaleString()}\n\n---\n\n`;
            
            history.forEach((msg, index) => {
                if (msg.role === 'system') { return; }
                
                const roleName = msg.role === 'assistant' ? '🤖 Assistant' : msg.role === 'user' ? '👤 User' : `🔧 Tool (${msg.tool_call_id})`;
                markdown += `### [${roleName}]\n\n${msg.content || ''}\n\n`;
                
                if (msg.tool_calls) {
                    markdown += `> **Action:** Calls ${msg.tool_calls.length} tools...\n\n`;
                }
                
                markdown += '---\n\n';
            });

            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), encoder.encode(markdown));

            return { status: 'success', message: `📤 对话已导出至: \`${require('path').relative(rootPath, filePath)}\`` };
        } catch (error: any) {
            return { status: 'error', message: `❌ 导出失败: ${error.message}` };
        }
    }
}
