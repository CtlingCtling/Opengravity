import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { TemplateManager } from '../../utils/templateManager';

/**
 * McpCommand: MCP 状态管理指令 (Kernel)
 */
export class McpCommand implements ICommand {
    name = 'mcp';
    description = '管理 MCP 服务器连接 (list, refresh)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'list':
                return await this.handleList(context);
            case 'refresh':
                return await this.handleRefresh(context);
            default:
                return await this.handleExplain(context);
        }
    }

    private async handleList(context: CommandContext): Promise<CommandResult> {
        const servers = context.mcp.getServerNames();
        if (servers.length === 0) return { status: 'success', message: '🔌 当前未连接任何 MCP 服务器。' };

        let msg = '🔗 **已连接的 MCP 服务器:**\n\n' + servers.map(name => `- **${name}**`).join('\n');
        msg += '\n\n使用 `/tools` 查看具体的原子能力。';

        return { status: 'success', message: msg };
    }

    private async handleRefresh(context: CommandContext): Promise<CommandResult> {
        try {
            await context.mcp.reload();
            const servers = context.mcp.getServerNames();
            return { status: 'success', message: `✅ MCP 重连成功。当前在线: ${servers.length > 0 ? servers.join(', ') : '无'}` };
        } catch (error: any) {
            return { status: 'error', message: `❌ MCP 重连失败: ${error.message}` };
        }
    }

    private async handleExplain(context: CommandContext): Promise<CommandResult> {
        const explanation = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/mcp_explanation.md');
        return { status: 'success', message: explanation };
    }
}
