import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { OPGV_TOOLS } from '../../tools/definitions';
import { TemplateManager } from '../../utils/templateManager';

/**
 * 工具概览：显示 AI 当前可以调用的所有原子能力 (Kernel)
 */
export class ToolsCommand implements ICommand {
    public name = 'tools';
    public description = '显示 AI 工具箱 (Kernel)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        try {
            const mcpTools = await context.mcp.getToolsForAI();
            const allTools = [...OPGV_TOOLS, ...mcpTools];

            const nativeList = OPGV_TOOLS.map(t => `- **${t.function.name}**: ${t.function.description}`).join('\n');
            
            let mcpList = "";
            const grouped = this.groupToolsByServer(mcpTools);
            for (const [server, tools] of Object.entries(grouped)) {
                mcpList += `\n**[${server}]**\n` + tools.map((t: any) => `- **${t.function.name}**: ${t.function.description}`).join('\n');
            }

            const rawTemplate = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/tools_list.md');
            const message = await TemplateManager.render(rawTemplate, {
                count: allTools.length,
                native_tools: nativeList,
                mcp_tools: mcpList || "_暂无外部工具_"
            });

            return { status: 'success', message: message };
        } catch (error: any) {
            return { status: 'error', message: `获取工具列表失败: ${error.message}` };
        }
    }

    private groupToolsByServer(mcpTools: any[]): Record<string, any[]> {
        const groups: Record<string, any[]> = {};
        mcpTools.forEach(tool => {
            const serverName = tool.serverName || '未知服务器';
            if (!groups[serverName]) groups[serverName] = [];
            groups[serverName].push(tool);
        });
        return groups;
    }
}
