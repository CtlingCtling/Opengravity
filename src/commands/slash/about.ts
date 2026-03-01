import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { TemplateManager } from '../../utils/templateManager';

/**
 * AboutCommand: 显示关于信息
 */
export class AboutCommand implements ICommand {
    name = 'about';
    description = '显示关于 Opengravity 的信息';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const content = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/about_info.md');
        return { status: 'success', message: content };
    }
}
