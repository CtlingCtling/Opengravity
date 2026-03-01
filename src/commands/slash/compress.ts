import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { Logger } from '../../utils/logger';
import { TemplateManager } from '../../utils/templateManager';

export class CompressCommand implements ICommand {
    name = 'compress';
    description = '折叠会话并固化状态快照 (Kernel)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const history = context.historyManager.getHistory();
        if (history.length < 4) return { status: 'error', message: '💡 内容过少，无需固化状态。' };

        await context.webview.postMessage({ type: 'aiResponse', value: '⏳ 正在构建 XML 状态快照 (Mirroring)...' });

        try {
            const compressPrompt = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/compress_prompt.md');
            
            // 构造一个特殊的压缩历史
            const tempHistory = [...history, { role: 'user', content: compressPrompt }];
            const response = await context.ai.generateContentStream(tempHistory as any, () => {}, []);
            if (!response.content) throw new Error('镜像构建失败');

            const mirror = response.content;
            const systemMsg = history.find(m => m.role === 'system');
            
            const newHistory: any[] = [];
            if (systemMsg) newHistory.push(systemMsg);
            
            // 注入镜像作为唯一的会话记忆
            newHistory.push({ 
                role: 'assistant', 
                content: `[STATE_SNAPSHOT]\n${mirror}` 
            });

            context.historyManager.loadHistory(newHistory);
            await context.webview.postMessage({ type: 'clearView' });
            await context.webview.postMessage({ type: 'restoreHistory', value: [{ role: 'ai', content: `✅ **状态已固化 (Mirror Set)**\n\n上下文已压缩为状态快照，多余的对话历史已清除。Opengravity 现在拥有一个高度凝聚的记忆。` }] });
            
            // 固化到持久化存储
            await context.chatHistoryService.saveCheckpoint('session_history', newHistory);

            return { status: 'success' };
        } catch (error: any) {
            Logger.error(`[OPGV] Mirroring failed: ${error.message}`);
            return { status: 'error', message: `❌ 固化失败: ${error.message}` };
        }
    }
}
