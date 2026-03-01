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
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;

        // [Init 2.0] 第一步：只要有工作区，就注入人格地基与灵魂
        if (hasWorkspace) {
            await TemplateManager.bootstrapSoul(context.extensionUri);
        }

        // 显式重置 Diff 按钮状态
        vscode.commands.executeCommand('setContext', 'opengravity.diffVisible', false);

        // 获取系统提示词
        const systemPrompt = await TemplateManager.getSystemPrompt(context.extensionUri);

        mcpHost = new McpHost();
        if (hasWorkspace) {
            await mcpHost.startup();
        }

        const diffProvider = new DiffContentProvider();
        context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, diffProvider));

        const getAIProvider = async (): Promise<AIProvider | null> => {
            const apiKey = await context.secrets.get('opengravity.apiKey');
            if (!apiKey) {
                const oldConfigKey = vscode.workspace.getConfiguration('opengravity').get<string>('apiKey');
                if (oldConfigKey) {
                    await context.secrets.store('opengravity.apiKey', oldConfigKey);
                    return new DeepSeekProvider(oldConfigKey);
                }
                return null;
            }
            return new DeepSeekProvider(apiKey);
        };

        const sidebarProvider = new ChatViewProvider(context.extensionUri, getAIProvider, mcpHost, systemPrompt);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, sidebarProvider));

        // [Init 2.0] 状态同步逻辑已移入 ChatViewProvider 的 webviewLoaded 处理器，此处不再使用 setTimeout

        // --- 指令注册 ---
        context.subscriptions.push(vscode.commands.registerCommand('opengravity.setApiKey', async () => {
            const key = await vscode.window.showInputBox({ prompt: 'Enter your DeepSeek API Key', password: true, placeHolder: 'sk-...' });
            if (key) {
                await context.secrets.store('opengravity.apiKey', key);
                vscode.window.showInformationMessage('✅ API Key saved securely.');
                await sidebarProvider.refreshSystemPrompt();
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('opengravity.showDiff', async (params: { originalUri: vscode.Uri, newContent: string }) => {
            const diffUri = DiffContentProvider.register(params.originalUri, params.newContent);
            await vscode.commands.executeCommand('vscode.diff', params.originalUri, diffUri, `Review AI Changes: ${params.originalUri.fsPath.split('/').pop()}`);
        }));

        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((doc) => {
            if (doc.uri.scheme === DiffContentProvider.scheme) {
                DiffContentProvider.clear(doc.uri);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('opengravity.applyDiff', async () => {
            await sidebarProvider.handleApplyDiff();
        }));

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
