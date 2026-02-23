import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { DynamicTOMLCommand } from './dynamic';

/**
 * 帮助指令：系统能力的导航地图
 */
export class HelpCommand implements ICommand {
    public name = 'help';
    public description = '显示指令帮助列表';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const allCommands = context.registry.getAllCommands();
        
        // 1. 如果带有具体参数，则显示该指令的详细帮助
        if (args.length > 0) {
            const targetName = args[0].replace(/^\//, ''); // 兼容 /help /about 和 /help about
            const target = context.registry.getCommand(targetName);
            if (target) {
                return this.showDetailedHelp(target, context);
            }
        }

        // 2. 否则显示概览列表
        const systemCmds = allCommands.filter(c => !(c instanceof DynamicTOMLCommand));
        const customSkills = allCommands.filter(c => c instanceof DynamicTOMLCommand);

        let helpMd = `## 🛠️ Opengravity 指令手册\n\n`;

        helpMd += `### 🖥️ 系统内核指令\n`;
        systemCmds.forEach(c => {
            helpMd += `- \`/${c.name}\`: ${c.description}\n`;
        });

        if (customSkills.length > 0) {
            helpMd += `\n### 🧩 用户自定义技能\n`;
            customSkills.forEach(c => {
                helpMd += `- \`/${c.name}\`: ${c.description}\n`;
            });
        }

        helpMd += `\n---\n💡 *提示：输入 \`/help <指令名>\` 查看详情。输入 \`@路径\` 注入上下文。*`;

        await context.webview.postMessage({
            type: 'aiResponse',
            value: helpMd
        });

        return { status: 'success' };
    }

    private async showDetailedHelp(cmd: ICommand, context: CommandContext): Promise<CommandResult> {
        let detail = `### 指令详情: \`/${cmd.name}\`\n\n`;
        detail += `> ${cmd.description}\n\n`;
        
        if (cmd instanceof DynamicTOMLCommand) {
            detail += `**类型**: 自定义 TOML 技能\n`;
            detail += `**逻辑**: 该指令会将您的输入合成到预设的 Prompt 模板中并发送给 AI。\n`;
        } else {
            detail += `**类型**: 系统内置逻辑\n`;
        }

        await context.webview.postMessage({
            type: 'aiResponse',
            value: detail
        });

        return { status: 'success' };
    }
}
