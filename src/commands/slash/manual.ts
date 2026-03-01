import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { OpengravityMode } from '../../session/StateManager';

/**
 * ManualCommand: 恢复手动模式
 */
export class ManualCommand implements ICommand {
    name = 'manual';
    description = '恢复手动模式：仅在提问时响应';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const protocolMsg = await context.stateManager.setMode(OpengravityMode.Manual);
        
        await context.onInjectMessage(protocolMsg);

        return { 
            status: 'success', 
            message: '🟡 **手动模式**：已回到日常对话状态。' 
        };
    }
}
