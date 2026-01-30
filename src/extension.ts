import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChatViewProvider } from './chatViewProvider';
import { AIProvider, DeepSeekProvider, GeminiProvider, ApiMessage } from './provider';
import { loadSystemPrompt } from './utils/promptLoader';

async function initializeWorkspace() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const rootPath = workspaceFolders[0].uri.fsPath;
    const configDir = path.join(rootPath, '.opengravity');

    if (!fs.existsSync(configDir)) {
        const selection = await vscode.window.showInformationMessage(
            'Opengravity: Detected a new workspace. Initialize folder structure?',
            'Initialize', 'Ignore'
        );

        if (selection === 'Initialize') {
            try {
                const folders = ['.opengravity','daily','codes','notes','todo','brainstorm','reviews'];
                folders.forEach(folder => {
                    const folderPath = path.join(rootPath, folder);
                    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
                });

                const systemPromptPath = path.join(configDir, 'SYSTEM.md');
                if (!fs.existsSync(systemPromptPath)) {
                    const defaultPrompt = `# SYSTEM PROMPT: Opengravity\n\nYou are Opengravity, an AI-Native DevOS assistant.\n- **Language**: Respond in Chinese.\n`;
                    fs.writeFileSync(systemPromptPath, defaultPrompt);
                }
                vscode.window.showInformationMessage('Opengravity workspace initialized! 🚀');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Initialization failed: ${error.message}`);
            }
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    initializeWorkspace();

    const getAIProvider = (): AIProvider | null => {
        const config = vscode.workspace.getConfiguration('opengravity');
        const providerType = config.get<string>('provider', 'deepseek');
        const apiKey = config.get<string>('apiKey');
        if (!apiKey) return null;
        return providerType === 'gemini' ? new GeminiProvider(apiKey) : new DeepSeekProvider(apiKey);
    };

    const sidebarProvider = new ChatViewProvider(context.extensionUri, getAIProvider);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, sidebarProvider));

    // --- 【修正后的 opengravity.ask 命令】 ---
    let askCommand = vscode.commands.registerCommand('opengravity.ask', async () => {
        const provider = getAIProvider();
        if (!provider) {
            vscode.window.showErrorMessage('请先在配置中填写 API Key。');
            return;
        }

        const userInput = await vscode.window.showInputBox({ prompt: "Ask Opengravity anything..." });
        if (!userInput) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Opengravity is thinking...",
            cancellable: true
        }, async () => {
            try {
                const systemPrompt = await loadSystemPrompt();
                
                // 【修正】构造 ApiMessage 数组，将 string 包装进去
                const messages: ApiMessage[] = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userInput }
                ];

                let fullContent = "";
                await provider.generateContentStream(
                    messages, // 👈 传数组，不再传字符串
                    (update) => {
                        if (update.type === 'content') fullContent += update.delta;
                    }
                );

                const doc = await vscode.workspace.openTextDocument({ content: fullContent, language: 'markdown' });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            } catch (error: any) {
                vscode.window.showErrorMessage(`AI Error: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(askCommand);
}

export function deactivate() {}