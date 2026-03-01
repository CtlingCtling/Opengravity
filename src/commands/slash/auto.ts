import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { OpengravityMode } from '../../session/StateManager';

/**
 * AutoCommand: 开启 Opengravity 的自动协作模式
 */
export class AutoCommand implements ICommand {
    name = 'auto';
    description = '开启自动模式：自由行动与表达';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const protocolMsg = await context.stateManager.setMode(OpengravityMode.Automatic);
        
        // 注入协议消息给 Opengravity，让她意识到权限开启
        await context.onInjectMessage(protocolMsg);

        return { 
            status: 'success', 
            message: '🟢 **Auto**：自动模式开启' 
        };
    }
}
