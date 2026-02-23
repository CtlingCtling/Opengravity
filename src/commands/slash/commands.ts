import { ICommand, CommandContext, CommandResult } from '../ICommand';

/**
 * 指令管理：系统指令的总入口
 */
export class CommandsCommand implements ICommand {
    public name = 'commands';
    public description = '管理系统指令。用法: `/commands` 或 `/commands reload`';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        // 提取子命令，默认为 list
        const subCommand = args.length > 0 ? args[0].toLowerCase() : 'list';

        switch (subCommand) {
            case 'reload':
                return await this.handleReload(context);
            case 'list':
                return await this.handleList(context);
            default:
                return { 
                    status: 'error', 
                    message: `⚠️ 未知的子命令: "${subCommand}"。请尝试 \`/commands reload\` 或 \`/commands list\`。` 
                };
        }
    }

    /**
     * 处理热重载
     */
    private async handleReload(context: CommandContext): Promise<CommandResult> {
        try {
            const beforeCount = context.registry.getAllCommands().length;
            await context.registry.reload();
            const afterCount = context.registry.getAllCommands().length;

            const feedback = `✅ **指令库重载完成**\n\n- 重载前: ${beforeCount} 个\n- 重载后: ${afterCount} 个\n- 状态: 所有自定义 TOML 指令已同步。`;
            
            await context.webview.postMessage({
                type: 'aiResponse',
                value: feedback
            });

            return { status: 'success' };
        } catch (error: any) {
            return { status: 'error', message: `❌ 重载指令失败: ${error.message}` };
        }
    }

    /**
     * 处理列表显示
     */
    private async handleList(context: CommandContext): Promise<CommandResult> {
        const all = context.registry.getAllCommands();
        let listMd = `### 📜 当前已加载指令概览\n\n`;
        
        all.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
            listMd += `- **/${c.name}**: ${c.description}\n`;
        });

        listMd += `\n---\n💡 *提示：输入 \`/help <指令名>\` 获取详细功能说明。*`;

        await context.webview.postMessage({
            type: 'aiResponse',
            value: listMd
        });

        return { status: 'success' };
    }
}
