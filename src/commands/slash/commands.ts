import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { TemplateManager } from '../../utils/templateManager';

/**
 * 指令管理：系统指令的总入口 (Kernel)
 */
export class CommandsCommand implements ICommand {
    public name = 'commands';
    public description = '管理系统指令 (Kernel)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const subCommand = args[0]?.toLowerCase() || 'list';
        switch (subCommand) {
            case 'reload': return await this.handleReload(context);
            case 'list': return await this.handleList(context);
            default: return { status: 'error', message: '用法: /commands [list|reload]' };
        }
    }

    private async handleReload(context: CommandContext): Promise<CommandResult> {
        try {
            await context.registry.reload();
            return { status: 'success', message: '✅ 指令库已成功热重载。' };
        } catch (error: any) {
            return { status: 'error', message: `❌ 重载失败: ${error.message}` };
        }
    }

    private async handleList(context: CommandContext): Promise<CommandResult> {
        const all = context.registry.getAllCommands();
        const commandList = all
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `- **/${c.name}**: ${c.description}`)
            .join('\n');

        const rawTemplate = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/commands_list.md');
        const content = await TemplateManager.render(rawTemplate, { commands: commandList });

        return { status: 'success', message: content };
    }
}
