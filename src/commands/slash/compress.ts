import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { Logger } from '../../utils/logger';
import { TemplateManager } from '../../utils/templateManager';

export class CompressCommand implements ICommand {
    name = 'compress';
    description = '折叠会话摘要 (Kernel)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const history = context.historyManager.getHistory();
        if (history.length < 4) return { status: 'error', message: '💡 内容过少，无需折叠。' };

        await context.webview.postMessage({ type: 'aiResponse', value: '⏳ 正在进行上下文压缩...' });

        try {
            const compressPrompt = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/compress_prompt.md');
            
            const tempHistory = [...history, { role: 'user', content: compressPrompt }];
            const response = await context.ai.generateContentStream(tempHistory as any, () => {}, []);
            if (!response.content) throw new Error('摘要生成失败');

            const summary = response.content;
            const systemMsg = history.find(m => m.role === 'system');
            const newHistory: any[] = [];
            if (systemMsg) newHistory.push(systemMsg);
            newHistory.push({ role: 'assistant', content: `[CONVERSATION SUMMARY]\n${summary}` });

            context.historyManager.loadHistory(newHistory);
            await context.webview.postMessage({ type: 'clearView' });
            await context.webview.postMessage({ type: 'restoreHistory', value: [{ role: 'ai', content: `✅ 会话已折叠：\n\n${summary}` }] });
            await context.chatHistoryService.saveCheckpoint('session_history', newHistory);

            return { status: 'success' };
        } catch (error: any) {
            Logger.error(`[OPGV] Compression failed: ${error.message}`);
            return { status: 'error', message: `❌ 压缩失败: ${error.message}` };
        }
    }
}
