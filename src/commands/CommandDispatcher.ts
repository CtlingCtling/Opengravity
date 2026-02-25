import { CommandRegistry } from './Registry';
import { CommandContext, CommandResult } from './ICommand';
import { AIProvider } from '../provider';
import { McpHost } from '../mcp/mcpHost';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AtHandler } from './at/AtHandler';
import { ShellHandler } from './shell/ShellHandler';
import { HistoryManager } from '../session/HistoryManager';
import { ChatHistoryService } from '../services/ChatHistoryService';

export class CommandDispatcher {
    private registry: CommandRegistry;

    constructor(extensionUri: vscode.Uri) {
        this.registry = new CommandRegistry(extensionUri);
        this.registry.loadAllCommands().then(() => {
            Logger.info('[OPGV] Registry initialized with system and workspace assets.');
        });
    }

    async reload() { await this.registry.reload(); }

    async dispatch(
        text: string, 
        ai: AIProvider, 
        mcp: McpHost, 
        webview: vscode.Webview, 
        extensionUri: vscode.Uri,
        onInjectMessage: (content: string) => Promise<void>,
        historyManager: HistoryManager,
        chatHistoryService: ChatHistoryService,
        chatViewProvider: any
    ): Promise<CommandResult | null> {
        const trimmed = text.trim();
        if (!trimmed) return null;

        const context: CommandContext = {
            ai, mcp, webview, extensionUri,
            registry: this.registry,
            onInjectMessage,
            historyManager,
            chatHistoryService,
            chatViewProvider
        };

        // 1. Slash Command (/)
        if (trimmed.startsWith('/')) {
            return await this.handleSlash(trimmed, context);
        }

        // 2. Context Command (@)
        if (trimmed.startsWith('@')) {
            const path = trimmed.slice(1).replace(/^"(.*)"$/, '$1'); // 支持引号路径
            return await AtHandler.handle(path, context);
        }

        // 3. Shell Command (!)
        if (trimmed.startsWith('!')) {
            return await ShellHandler.handle(trimmed, context);
        }

        return null;
    }

    private async handleSlash(text: string, context: CommandContext): Promise<CommandResult> {
        const [rawName, ...args] = text.slice(1).split(/\s+/);
        const name = rawName.toLowerCase();
        const command = this.registry.getCommand(name);

        if (command) {
            try {
                return await command.execute(args, context);
            } catch (e: any) {
                return { status: 'error', message: `指令 /${name} 执行失败: ${e.message}` };
            }
        }
        return { status: 'error', message: `未找到指令: /${name}` };
    }
}
