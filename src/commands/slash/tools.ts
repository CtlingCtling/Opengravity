import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { OPGV_TOOLS } from '../../tools/definitions';

/**
 * 工具概览：显示 AI 当前可以调用的所有原子能力
 */
export class ToolsCommand implements ICommand {
    public name = 'tools';
    public description = '显示 AI 当前可用的所有工具及其描述';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        try {
            // 获取原生工具和 MCP 工具
            const mcpTools = await context.mcp.getToolsForAI();
            const allTools = [...OPGV_TOOLS, ...mcpTools];

            let toolsMd = `## 🔧 AI 工具箱汇总

`;
            toolsMd += `当前环境下 AI 共具备 **${allTools.length}** 项原子能力。

`;

            // 分类展示：原生工具
            toolsMd += `### 🛠️ 原生核心工具
`;
            OPGV_TOOLS.forEach(t => {
                toolsMd += `- **${t.function.name}**: ${t.function.description}
`;
            });

            // 分类展示：MCP 扩展工具
            if (mcpTools.length > 0) {
                toolsMd += `
### 🌐 MCP 扩展能力
`;
                // 按服务器名称分组显示
                const grouped = this.groupToolsByServer(mcpTools);
                for (const [server, tools] of Object.entries(grouped)) {
                    toolsMd += `
**[${server}]**
`;
                    tools.forEach((t: any) => {
                        toolsMd += `- **${t.function.name}**: ${t.function.description}
`;
                    });
                }
            }

            toolsMd += `
---
💡 *这些工具由 AI 根据任务意图自动调度，无需手动执行。*`;

            await context.webview.postMessage({
                type: 'aiResponse',
                value: toolsMd
            });

            return { status: 'success' };
        } catch (error: any) {
            return { status: 'error', message: `获取工具列表失败: ${error.message}` };
        }
    }

    private groupToolsByServer(mcpTools: any[]): Record<string, any[]> {
        const groups: Record<string, any[]> = {};
        mcpTools.forEach(tool => {
            const serverName = tool.serverName || '未知服务器';
            if (!groups[serverName]) { groups[serverName] = []; }
            groups[serverName].push(tool);
        });
        return groups;
    }
}
