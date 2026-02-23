import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { AIProvider, DeepSeekProvider, GeminiProvider } from './provider';
import { McpHost } from './mcp/mcpHost';
import { TemplateManager } from './utils/templateManager';
import { Logger } from './utils/logger';

let mcpHost: McpHost | undefined;

export async function activate(context: vscode.ExtensionContext) {
    Logger.initialize(context);
    try {
        await TemplateManager.initWorkspace(context.extensionUri);

        const systemPrompt = await TemplateManager.getSystemPrompt(context.extensionUri);

        mcpHost = new McpHost();
        await mcpHost.startup();

        const getAIProvider = (): AIProvider | null => {
            const config = vscode.workspace.getConfiguration('opengravity');
            const apiKey = config.get<string>('apiKey');
            if (!apiKey) {
                return null;
            }
            return new DeepSeekProvider(apiKey);
        };

        const sidebarProvider = new ChatViewProvider(
            context.extensionUri, 
            getAIProvider, 
            mcpHost!, 
            systemPrompt
        );
    
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, sidebarProvider)
        );

        context.subscriptions.push(vscode.commands.registerCommand('opengravity.showDiff', async (aiCode: string) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            const aiDoc = await vscode.workspace.openTextDocument({ content: aiCode, language: editor.document.languageId });
            await vscode.commands.executeCommand('vscode.diff', editor.document.uri, aiDoc.uri, 'Diff View');
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