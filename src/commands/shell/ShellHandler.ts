import * as vscode from 'vscode';
import { CommandContext, CommandResult } from '../ICommand';
import { ToolExecutor } from '../../tools/executor';
import { Logger } from '../../utils/logger';

/**
 * ShellHandler: 处理以 '!' 开头的终端直通指令
 * [God Mode] 用户手动输入的指令拥有最高权限，立即流式执行，无需审批。
 */
export class ShellHandler {
    static async handle(text: string, context: CommandContext): Promise<CommandResult | null> {
        const command = text.slice(1).trim();
        if (!command) {
            return { status: 'error', message: '请输入要执行的命令，例如: !ls' };
        }

        Logger.info(`[OPGV] User executing shell command: ${command}`);

        // 1. [关键修复] 立即开启新的消息流，确保 UI 顺序正确 (User -> New AI Bubble)
        await context.webview.postMessage({ type: 'streamStart' });

        try {
            // 2. 显示执行状态头部
            await context.webview.postMessage({ 
                type: 'streamUpdate', 
                value: `Running: \`${command}\`...\n`, 
                dataType: 'terminal' 
            });

            // 3. 流式执行
            await ToolExecutor.run_command({ command }, (chunk) => {
                context.webview.postMessage({ 
                    type: 'streamUpdate', 
                    value: chunk, 
                    dataType: 'terminal' 
                });
            });

        } catch (e: any) {
            await context.webview.postMessage({ 
                type: 'streamUpdate', 
                value: `\n❌ Error: ${e.message}`, 
                dataType: 'terminal' 
            });
        } finally {
            // 4. 结束流，解锁输入
            await context.webview.postMessage({ type: 'streamEnd' });
        }

        // 返回 null 表示不需要 Dispatcher 再发额外的文本消息，所有的 UI 更新都通过流处理了
        return null;
    }
}
