import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { TemplateManager } from '../../utils/templateManager';

/**
 * HelpCommand: 显示系统引导手册
 */
export class HelpCommand implements ICommand {
    name = 'help';
    description = '显示 Opengravity 操作指南与指令列表';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const commandList = context.registry.getCommandList();
        const rawTemplate = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/help_guide.md');
        const content = await TemplateManager.render(rawTemplate, { commands: commandList });

        return { status: 'success', message: content };
    }
}
