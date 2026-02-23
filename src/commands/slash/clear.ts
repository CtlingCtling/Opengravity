import { ICommand, CommandContext, CommandResult } from '../ICommand';

/**
 * 清屏指令：清除 Webview 上的所有对话显示
 */
export class ClearCommand implements ICommand {
    public name = 'clear';
    public description = '清空当前对话界面的显示';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        // 向 Webview 发送指令，具体的 DOM 清除逻辑由前端 chat.js 处理
        await context.webview.postMessage({
            type: 'clearView'
        });

        // 返回成功，Dispatcher 会停止后续 AI 流
        return { status: 'success' };
    }
}
