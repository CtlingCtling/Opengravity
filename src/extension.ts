import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { AIProvider, DeepSeekProvider } from './provider';
import { McpHost } from './mcp/mcpHost';
import { TemplateManager } from './utils/templateManager';
import { Logger } from './utils/logger';
import { DiffContentProvider } from './utils/diffProvider';

let mcpHost: McpHost | undefined;

export async function activate(context: vscode.ExtensionContext) {
    Logger.initialize(context);
    try {
        // 1. 确保 .opengravity 配置目录及其模板存在 (自动感知)
        await TemplateManager.ensureConfigDir(context.extensionUri);

        // 显式重置 Diff 按钮状态
        vscode.commands.executeCommand('setContext', 'opengravity.diffVisible', false);

        const systemPrompt = await TemplateManager.getSystemPrompt(context.extensionUri);

        mcpHost = new McpHost();
        await mcpHost.startup();

        // 注册虚拟文档提供者
        const diffProvider = new DiffContentProvider();
        context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, diffProvider)
        );

        const getAIProvider = (): AIProvider | null => {
            const config = vscode.workspace.getConfiguration('opengravity');
            const apiKey = config.get<string>('apiKey');
            if (!apiKey) return null;
            return new DeepSeekProvider(apiKey);
        };

        const sidebarProvider = new ChatViewProvider(
            context.extensionUri, 
            getAIProvider, 
            mcpHost, 
            systemPrompt
        );
    
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, sidebarProvider)
        );

        // 专业 Diff 视图
        context.subscriptions.push(vscode.commands.registerCommand('opengravity.showDiff', async (params: { originalUri: vscode.Uri, newContent: string }) => {
            const diffUri = DiffContentProvider.register(params.originalUri, params.newContent);
            await vscode.commands.executeCommand('vscode.diff', params.originalUri, diffUri, `Review AI Changes: ${params.originalUri.fsPath.split('/').pop()}`);
        }));

        // 应用修改：直接路由到 Provider 状态
        context.subscriptions.push(vscode.commands.registerCommand('opengravity.applyDiff', async () => {
            await sidebarProvider.handleApplyDiff();
        }));

        // 取消修改：直接路由到 Provider 状态
        context.subscriptions.push(vscode.commands.registerCommand('opengravity.cancelDiff', async () => {
            await sidebarProvider.handleCancelDiff();
        }));

        Logger.info('[CHECK] Opengravity is now active!');
    } catch (error: any) {
        Logger.error('[OOOPS] Failed to activate Opengravity:', error);
        vscode.window.showErrorMessage(`Failed to activate Opengravity: ${error.message}`);
    }
}

export function deactivate() {
    if (mcpHost) {
        mcpHost.shutdown();
    }
}
