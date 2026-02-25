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

        // [安全修复] 异步获取 API Key
        const getAIProvider = async (): Promise<AIProvider | null> => {
            const apiKey = await context.secrets.get('opengravity.apiKey');
            if (!apiKey) {
                // 如果没有 Key，尝试从旧配置迁移（可选）或直接返回 null
                const oldConfigKey = vscode.workspace.getConfiguration('opengravity').get<string>('apiKey');
                if (oldConfigKey) {
                    await context.secrets.store('opengravity.apiKey', oldConfigKey);
                    return new DeepSeekProvider(oldConfigKey);
                }
                return null;
            }
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

        // [安全修复] 设置 API Key 的指令
        context.subscriptions.push(vscode.commands.registerCommand('opengravity.setApiKey', async () => {
            const key = await vscode.window.showInputBox({
                prompt: 'Enter your DeepSeek API Key',
                password: true,
                placeHolder: 'sk-...'
            });
            if (key) {
                await context.secrets.store('opengravity.apiKey', key);
                vscode.window.showInformationMessage('✅ API Key saved securely.');
                // 刷新系统提示词以应用新 Key
                await sidebarProvider.refreshSystemPrompt();
            }
        }));

        // 专业 Diff 视图
        context.subscriptions.push(vscode.commands.registerCommand('opengravity.showDiff', async (params: { originalUri: vscode.Uri, newContent: string }) => {
            const diffUri = DiffContentProvider.register(params.originalUri, params.newContent);
            await vscode.commands.executeCommand('vscode.diff', params.originalUri, diffUri, `Review AI Changes: ${params.originalUri.fsPath.split('/').pop()}`);
        }));

        // [修复] 监听文档关闭，自动清理虚拟文档内容，防止内存泄漏 (Issue 8)
        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((doc) => {
            if (doc.uri.scheme === DiffContentProvider.scheme) {
                DiffContentProvider.clear(doc.uri);
                Logger.info(`[OPGV] Virtual document cleared: ${doc.uri.toString()}`);
            }
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
