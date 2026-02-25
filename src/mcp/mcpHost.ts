/**
 * ## mcpHost.ts - MCP host管理类
 * #EXPLAINATION:
 * - 连接MCP服务器
 * - 获取MCP工具、提示词和资源列表
 * - 执行MCP工具调用
 * - 读取MCP资源内容
 */

/**
 * ## imports
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { 
    CallToolResultSchema, 
    ListToolsResultSchema, 
    ListPromptsResultSchema, 
    GetPromptResultSchema,
    ListResourcesResultSchema,
    ReadResourceResultSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Logger } from '../utils/logger';

/**
 * ## MCP配置接口
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

export class McpHost {
    private clients: Map<string, Client> = new Map();
    private isInitialized = false;

    private static readonly ALLOWED_MCP_COMMANDS = ['npx', 'node', 'uv', 'python', 'python3']; 
    private static readonly SAFE_ARG_REGEX = /^[\w\s\-\.\/\=\\:@]+$/; 

    private validateMcpCommand(command: string, args: string[]): void {
        if (!McpHost.ALLOWED_MCP_COMMANDS.includes(command)) {
            throw new Error(`Unauthorized command: ${command}.`);
        }
        for (const arg of args) {
            if (!McpHost.SAFE_ARG_REGEX.test(arg)) {
                throw new Error(`Unsafe argument detected: '${arg}'.`);
            }
        }
    }

    async shutdown() {
        for (const [name, client] of this.clients) {
            try {
                await client.close();
                Logger.info(`[✅] MCP: ${name} 已断开 | disconnected`);
            } catch (err: any) {
                Logger.error(`[❌] MCP: Error disconnecting ${name}: ${err.message}`);
            }
        }
        this.clients.clear();
        this.isInitialized = false;
    }

    /**
     * 重启 MCP 服务
     */
    async reload() {
        await this.shutdown();
        await this.startup();
    }

    /**
     * 获取已连接服务器列表
     */
    getServerNames(): string[] {
        return Array.from(this.clients.keys());
    }

    async startup() {
        if (this.isInitialized) { return; }
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) { return; }

        const configPath = path.join(folders[0].uri.fsPath, '.opengravity', 'mcp_config.json');
        
        try {
            await fs.promises.access(configPath); 
            const configContent = await fs.promises.readFile(configPath, 'utf-8');
            const config: McpConfig = JSON.parse(configContent);

            for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
                await this.connectServer(serverName, serverConfig);
            }
            this.isInitialized = true;
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                Logger.info("MCP config file not found. Skipping MCP server startup.");
            } else {
                Logger.error(`MCP Config error: ${e.message}`, e);
            }
        }
    }

    private async connectServer(name: string, config: { command: string, args: string[], env?: any }) {
        this.validateMcpCommand(config.command, config.args);
        try {
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: { ...process.env, ...(config.env || {}) }
            });

            // [修正重构] 按照客户端规范声明能力
            const client = new Client(
                { name: "Opengravity-Host", version: "1.0.0" },
                { 
                    capabilities: { 
                        // 客户端能力通常包括 roots, sampling 等
                        // 对于基础工具/提示词/资源调用，这里可以先留空
                    } 
                }
            );

            await client.connect(transport);
            this.clients.set(name, client);
            vscode.window.showInformationMessage(`[✅] MCP: ${name} 已连接 | connected`);
            
            // [TODO] 捕获 stderr 并记录日志
            // 注意：StdioClientTransport 内部管理进程，捕获 stderr 可能需要扩展 transport 层或使用 SDK 提供的 hook
        } catch (e: any) {
            Logger.error(`[❌] MCP 连接出错 | Connection error: ${name}`, e);
        }
    }

    async getToolsForAI() {
        const allTools: any[] = [];
        for (const [serverName, client] of this.clients) {
            try {
                const result = await client.request({ method: "tools/list" }, ListToolsResultSchema);
                allTools.push(...result.tools.map(tool => ({
                    type: "function",
                    function: {
                        name: `${serverName}__${tool.name}`,
                        description: tool.description || "",
                        parameters: tool.inputSchema,
                        strict: true
                    }
                })));
            } catch (e: any) {
                Logger.error(`Failed to list tools from ${serverName}:`, e);
            }
        }
        return allTools;
    }

    async getPromptsForAI() {
        const allPrompts: any[] = [];
        for (const [serverName, client] of this.clients) {
            try {
                const result = await client.request({ method: "prompts/list" }, ListPromptsResultSchema);
                allPrompts.push(...result.prompts.map(prompt => ({
                    serverName,
                    name: prompt.name,
                    description: prompt.description || "",
                    arguments: prompt.arguments || []
                })));
            } catch (e: any) {
                Logger.error(`Failed to list prompts from ${serverName}:`, e);
            }
        }
        return allPrompts;
    }

    async getResourcesForAI() {
        const allResources: any[] = [];
        for (const [serverName, client] of this.clients) {
            try {
                const result = await client.request({ method: "resources/list" }, ListResourcesResultSchema);
                allResources.push(...result.resources.map(resource => ({
                    serverName,
                    name: resource.name,
                    uri: resource.uri,
                    description: resource.description || "",
                    mimeType: resource.mimeType
                })));
            } catch (e: any) {
                Logger.error(`Failed to list resources from ${serverName}:`, e);
            }
        }
        return allResources;
    }

    async getPromptContent(serverName: string, promptName: string, args: any): Promise<string> {
        const client = this.clients.get(serverName);
        if (!client) { return `[❌] Error: 服务器 ${serverName} 未连接.`; }

        try {
            const result = await client.request({ 
                method: "prompts/get", 
                params: { name: promptName, arguments: args } 
            }, GetPromptResultSchema);
            
            return result.messages.map(m => {
                const text = m.content.type === 'text' ? m.content.text : '[Non-text content]';
                return `[${m.role}] ${text}`;
            }).join("\n---\n");
        } catch (e: any) {
            return `[❌] Error: ${e.message}`;
        }
    }

    /**
     * [URI重构] 使用标准的 URI 方式读取资源内容
     */
    async getResourceContent(serverName: string, resourceUri: string): Promise<string> {
        const client = this.clients.get(serverName);
        if (!client) { return `[❌] Error: 服务器 ${serverName} 未连接.`; }

        try {
            const result = await client.request({ 
                method: "resources/read", 
                params: { uri: resourceUri } 
            }, ReadResourceResultSchema);
            
            return result.contents.map(c => {
                if ('text' in c) { return c.text; }
                return `[Binary Content: ${c.mimeType}]`;
            }).join("\n---\n");
        } catch (e: any) {
            return `[❌] Error: ${e.message}`;
        }
    }

    async executeTool(prefixedName: string, args: any): Promise<string> {
        const sep = prefixedName.indexOf("__");
        if (sep === -1) { return "[❌] Error: 格式错误.";}
        
        const serverName = prefixedName.substring(0, sep);
        const toolName = prefixedName.substring(sep + 2);
        const client = this.clients.get(serverName);
        
        if (!client) { return `[❌] Error: 服务器 ${serverName} 未连接.`; }

        const confirm = await vscode.window.showInformationMessage(
            `[🔗] OPGV 执行工具: [${serverName}] ${toolName}`, "ACPT", "RJCT"
        );
        if (confirm !== "ACPT") { return "User denied."; }

        try {
            const result = await client.request({ 
                method: "tools/call", 
                params: { name: toolName, arguments: args } 
            }, CallToolResultSchema);
            
            return JSON.stringify(result.content);
        } catch (e: any) { 
            return `[❌] Error: ${e.message}`; 
        }
    }
}
