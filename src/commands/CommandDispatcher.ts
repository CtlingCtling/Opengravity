import { CommandRegistry } from './Registry';
import { CommandContext, CommandResult } from './ICommand';
import { AIProvider } from '../provider';
import { McpHost } from '../mcp/mcpHost';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AtHandler } from './at/AtHandler';
import { ShellHandler } from './shell/ShellHandler';

export class CommandDispatcher {
    private registry: CommandRegistry;

    constructor() {
        this.registry = new CommandRegistry();
        // 异步启动加载
        this.registry.loadCustomCommands().then(() => {
            Logger.info('[OPGV] Custom commands loaded into registry.');
        });
    }

    /**
     * 重新加载指令
     */
    async reload() {
        await this.registry.reload();
    }

    /**
     * 核心分发逻辑
     */
    async dispatch(
        text: string, 
        ai: AIProvider, 
        mcp: McpHost, 
        webview: vscode.Webview, 
        extensionUri: vscode.Uri,
        onInjectMessage: (content: string) => Promise<void>
    ): Promise<CommandResult | null> {
        const trimmedText = text.trim();

        const context: CommandContext = {
            ai,
            mcp,
            webview,
            extensionUri,
            registry: this.registry,
            onInjectMessage
        };

        // 1. 处理 Slash Commands (/)
        if (trimmedText.startsWith('/')) {
            Logger.info(`[OPGV] Command detected: ${trimmedText}`);
            const result = await this.handleSlashCommand(trimmedText, context);
            Logger.info(`[OPGV] Command execution result: ${result.status}`);
            return result;
        }

        // 2. 处理 At Commands (@)
        // 使用高级正则捕获：支持 @path 或 @"path with spaces"
        const atRegex = /^@(?:"([^"]+)"|(\S+))/;
        const atMatch = trimmedText.match(atRegex);
        
        if (atMatch) {
            const capturedPath = atMatch[1] || atMatch[2];
            Logger.info(`[OPGV] Context shortcut detected: ${capturedPath}`);
            return await AtHandler.handle(capturedPath, context);
        }

        // 3. 处理 Shell Commands (!)
        if (trimmedText.startsWith('!')) {
            Logger.info(`[OPGV] Shell bridge detected: ${trimmedText}`);
            return await ShellHandler.handle(trimmedText, context);
        }

        return null;
    }

    private async handleSlashCommand(text: string, context: CommandContext): Promise<CommandResult> {
        const parts = text.slice(1).split(/\s+/);
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        const command = this.registry.getCommand(commandName);
        if (command) {
            try {
                return await command.execute(args, context);
            } catch (error: any) {
                Logger.error(`[OPGV] Command execution failed: ${error.message}`);
                return { status: 'error', message: `执行指令失败: ${error.message}` };
            }
        }

        Logger.warn(`[OPGV] Unknown command: /${commandName}`);
        return { status: 'error', message: `未知的指令: /${commandName}` };
    }
}
