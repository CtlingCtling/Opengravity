
/**
 * ## mcpHost.ts - MCP host管理类
 * #EXPLAINATION:
 * - 连接MCP服务器
 * - 获取MCP工具列表
 * - 调用MCP工具
 */

/**
 * ## imports
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * ## MCP配置接口
 * #EXPLAINATION:
 * - 从mcp_config.json中加载mcp配置
 * - command: npx...
 * - args: [...]
 * - env: { KEY: VALUE }
 * - 格式如下：
 */

interface McpConfig {
    mcpServers: {
        [key: string]: {
            command: string;
            args: string[];
            env?: Record<string, string>;
        };
    };
}

/**
 * ## McpHost Class
 * #EXPLAINATION:
 * private:
 * - clients: Map<string, Client> 存储已连接的MCP客户端
 * - isInitialized: boolean 标记是否已经配置MCP
 * 
 * public:
 * - startup(): 初始化连接MCP服务器
 * - getToolsForAI(): 获取所有MCP工具列表，供AI调用
 * - executeTool(prefixedName: string, args: any): 调用指定MCP工具并返回结果
 * 
 * #USAGE:
 * - 在extension.ts中实例化并启动McpHost
 * - 通过McpHost获取工具列表并传递给AIProvider
 * - 当AI需要调用工具时，通过McpHost执行工具调用
 */

export class McpHost {
    private clients: Map<string, Client> = new Map();
    private isInitialized = false;

    async startup() {
        if (this.isInitialized) {
            return;
        }
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return;
        }

        const configPath = path.join(folders[0].uri.fsPath, '.opengravity', 'mcp_config.json');
        if (!fs.existsSync(configPath)) {
            return;
        }

        try {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const config: McpConfig = JSON.parse(configContent);

            for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
                await this.connectServer(serverName, serverConfig);
            }
            this.isInitialized = true;
        } catch (e: any) {
            console.error(`[❌] MCP Config error: ${e.message}`);
        }
    }

    private async connectServer(name: string, config: { command: string, args: string[], env?: any }) {
        try {
            const cleanEnv: Record<string, string> = {};
            Object.entries(process.env).forEach(([k, v]) => {
                if (v !== undefined) {
                    cleanEnv[k] = v;
                }
            });
            const finalEnv = { ...cleanEnv, ...config.env };

            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: finalEnv
            });

            const client = new Client(
                { name: "Opengravity-Host", version: "1.0.0" },
                { capabilities: {} }
            );

            await client.connect(transport);
            this.clients.set(name, client);
            vscode.window.showInformationMessage(`[✅] MCP: ${name} 已连接 | connected`);
        } catch (e) {
            console.error(`[❌] MCP 连接出错 | Connection error: ${name}`, e);
        }
    }

    async getToolsForAI() {
        const allTools: any[] = [];
        for (const [serverName, client] of this.clients) {
            try {
                const result = await client.listTools();
                allTools.push(...result.tools.map(tool => ({
                    type: "function",
                    function: {
                        name: `${serverName}__${tool.name}`,
                        description: tool.description || "",
                        parameters: tool.inputSchema,
                        strict: true
                    }
                })));
            } catch (e) { console.error(e); }
        }
        return allTools;
    }

    async executeTool(prefixedName: string, args: any): Promise<string> {
        const sep = prefixedName.indexOf("__");
        if (sep === -1) {
            return "[❌] Error: 格式错误 | Invalid format.";
        }
        const serverName = prefixedName.substring(0, sep);
        const toolName = prefixedName.substring(sep + 2);
        const client = this.clients.get(serverName);
        if (!client) {
            return `[❌] Error: 服务器未连接 | Server ${serverName} inactive.`;
        }

        const confirm = await vscode.window.showInformationMessage(
            `[🔗] OPGV 执行工具 | OPGV using tool: [${serverName}] ${toolName}`, "ACPT", "RJCT"
        );
        if (confirm !== "RJCT") {
            return "User denied.";
        }
        try {
            const result = await client.callTool({ name: toolName, arguments: args });
            return JSON.stringify(result.content);
        } catch (e: any) { return `[❌] Error: ${e.message}`; }
    }
}