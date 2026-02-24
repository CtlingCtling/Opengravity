import { ICommand, CommandContext, CommandResult } from '../ICommand';

/**
 * McpCommand: MCP 状态管理指令
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
                // 默认行为：解释 MCP
                return await this.handleExplain(context);
        }
    }

    private async handleList(context: CommandContext): Promise<CommandResult> {
        const servers = context.mcp.getServerNames();
        if (servers.length === 0) {
            return { status: 'success', message: '🔌 当前未连接任何 MCP 服务器。' };
        }

        let msg = '🔗 **已连接的 MCP 服务器:**\n\n';
        servers.forEach(name => {
            msg += `- **${name}**\n`;
        });
        msg += '\n使用 `/tools` 查看具体的原子能力。';

        return { status: 'success', message: msg };
    }

    private async handleRefresh(context: CommandContext): Promise<CommandResult> {
        await context.webview.postMessage({
            type: 'aiResponse',
            value: '⏳ 正在重连所有 MCP 服务器...'
        });

        try {
            await context.mcp.reload();
            const servers = context.mcp.getServerNames();
            return { 
                status: 'success', 
                message: `✅ MCP 重连成功。当前在线: ${servers.length > 0 ? servers.join(', ') : '无'}` 
            };
        } catch (error: any) {
            return { status: 'error', message: `❌ MCP 重连失败: ${error.message}` };
        }
    }

    private async handleExplain(context: CommandContext): Promise<CommandResult> {
        const explanation = [
            "### 🌐 什么是 MCP (Model Context Protocol)?",
            "",
            "MCP 是 Anthropic 推出的开放协议，旨在让 AI 模型安全地访问本地工具、提示词和资源。",
            "",
            "在 Opengravity 中，您可以通过 `.opengravity/mcp_config.json` 配置多个服务器，让 AI 具备搜索网页、读取数据库或操作本地文件的能力。",
            "",
            "**可用子命令:**",
            "- `/mcp list`: 查看当前在线的服务器。",
            "- `/mcp refresh`: 重新加载配置文件并重连。"
        ].join('\n');

        await context.webview.postMessage({
            type: 'aiResponse',
            value: explanation
        });

        return { status: 'success' };
    }
}
