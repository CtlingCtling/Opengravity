import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { Logger } from '../../utils/logger';

/**
 * CompressCommand: 上下文折叠指令
 * 调用 AI 对当前对话进行摘要，并替换冗长的历史记录。
 * 借鉴 gemini-cli 的 compressCommand.ts 逻辑。
 */
export class CompressCommand implements ICommand {
    name = 'compress';
    description = '折叠当前会话：调用 AI 生成对话摘要并替换历史，节省 Token。';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const history = context.historyManager.getHistory();
        
        // 1. 检查是否有足够内容进行压缩
        if (history.length < 4) {
            return { status: 'error', message: '💡 对话内容尚少，无需进行压缩折叠。' };
        }

        await context.webview.postMessage({
            type: 'aiResponse',
            value: '⏳ 正在分析对话并生成摘要，请稍候...'
        });

        try {
            // 2. 构造压缩指令的 Prompt
            const compressPrompt = [
                "请对以上对话进行精简总结。要求：",
                "1. 保留已达成的关键决策和技术路径。",
                "2. 记录当前待办任务 (TODO) 或未解决的问题。",
                "3. 移除重复的调试过程和冗长的中间代码。",
                "请以『[CONVERSATION SUMMARY]』作为开头。"
            ].join('\n');

            // 3. 调用 AI 获取摘要
            const tempHistory = [...history, { role: 'user', content: compressPrompt }];
            
            const response = await context.ai.generateContentStream(
                tempHistory as any, 
                () => {}, 
                [] 
            );

            if (!response.content) {
                throw new Error('AI 未能生成有效的摘要。');
            }

            const summary = response.content;

            // 4. 重置内存状态 (保留系统提示词)
            const systemMsg = history.find(m => m.role === 'system');
            const newHistory: any[] = []; // 使用 any[] 或显式类型声明来规避 role 类型推断问题
            if (systemMsg) newHistory.push(systemMsg);
            
            newHistory.push({ 
                role: 'assistant' as const, 
                content: `对话已折叠。这是之前的要点总结：\n\n${summary}` 
            });

            context.historyManager.loadHistory(newHistory);

            // 5. 同步 Webview UI
            await context.webview.postMessage({ type: 'clearView' });
            await context.webview.postMessage({
                type: 'restoreHistory',
                value: [
                    { role: 'ai', content: `✅ **会话已成功折叠**\n\n历史消息已替换为摘要以节省上下文空间。以下是当前的记忆点：\n\n${summary}` }
                ]
            });

            // 6. 持久化
            await context.chatHistoryService.saveCheckpoint('session_history', newHistory);

            return { status: 'success' };

        } catch (error: any) {
            Logger.error(`[OPGV] Compression failed: ${error.message}`);
            return { status: 'error', message: `❌ 压缩会话失败: ${error.message}` };
        }
    }
}
