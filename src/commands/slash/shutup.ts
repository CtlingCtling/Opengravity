import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { OpengravityMode } from '../../session/StateManager';

/**
 * ShutUpCommand: 开启静默模式，让 Opengravity 休息
 */
export class ShutUpCommand implements ICommand {
    name = 'shutup';
    description = '静默模式：休息，禁止 UI 主动输出';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const protocolMsg = await context.stateManager.setMode(OpengravityMode.Silent);
        
        // 注入协议消息给 Opengravity，通知她进入静默状态
        await context.onInjectMessage(protocolMsg);

        return { 
            status: 'success', 
            message: '🔇 **Asleep**：静默模式开启' 
        };
    }
}
