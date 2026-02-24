import * as vscode from 'vscode';
import { AIProvider } from '../provider';
import { McpHost } from '../mcp/mcpHost';
import { CommandRegistry } from './Registry';
import { HistoryManager } from '../session/HistoryManager';
import { ChatHistoryService } from '../services/ChatHistoryService';

/**
 * 指令执行上下文，为指令提供各种系统能力的引用
 */
export interface CommandContext {
    ai: AIProvider;
    mcp: McpHost;
    webview: vscode.Webview;
    extensionUri: vscode.Uri;
    registry: CommandRegistry;
    historyManager: HistoryManager;
    chatHistoryService: ChatHistoryService;
    chatViewProvider: any; // 传入 ChatViewProvider 实例以支持高级刷新
    // 用于向对话流注入“虚拟用户消息”的回调
    onInjectMessage: (content: string) => Promise<void>;
}

/**
 * 执行结果类型
 */
export interface CommandResult {
    status: 'success' | 'error' | 'intercepted';
    message?: string;
}

/**
 * 所有指令必须实现的接口
 */
export interface ICommand {
    name: string;
    description: string;
    execute(args: string[], context: CommandContext): Promise<CommandResult>;
}
