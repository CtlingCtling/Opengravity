import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
// 导入新写的侧边栏 Provider
import { ChatViewProvider } from './chatViewProvider';
// 导入 AI 引擎逻辑
import { AIProvider, DeepSeekProvider, GeminiProvider } from './provider';

// --- 核心功能：工作区初始化 ---
async function initializeWorkspace() {
    // 1. 获取当前打开的文件夹
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return; // 没有打开文件夹，不做任何事
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const configDir = path.join(rootPath, '.opengravity');

    // 2. 检查 .opengravity 是否存在
    if (!fs.existsSync(configDir)) {
        // 如果不存在，说明这是一个新环境，询问用户是否初始化
        const selection = await vscode.window.showInformationMessage(
            'Opengravity: Detected a new workspace. Initialize folder structure?',
            'Initialize', 'Ignore'
        );

        if (selection === 'Initialize') {
            try {
                // 3. 创建核心文件夹结构
                const folders = [
                    '.opengravity',
                    'daily',
                    'codes',
                    'notes',
                    'todo',
                    'brainstorm',
                    'reviews'
                ];

                folders.forEach(folder => {
                    const folderPath = path.join(rootPath, folder);
                    if (!fs.existsSync(folderPath)) {
                        fs.mkdirSync(folderPath, { recursive: true });
                    }
                });

                // 4. 创建默认的 SYSTEM.md
                const systemPromptPath = path.join(configDir, 'SYSTEM.md');
                if (!fs.existsSync(systemPromptPath)) {
                    const defaultPrompt = 
`# SYSTEM PROMPT: Opengravity

You are Opengravity, an AI-Native DevOS assistant integrated into VSCodium.
- **Language**: Respond in Chinese (Simplified).
- **Style**: Professional, concise, and helpful.
- **Role**: Help the user with code reviews, brainstorming, and daily planning.
`;
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
    console.log('Opengravity is now active!');

    // --- 1. 启动时检查初始化 ---
    initializeWorkspace();

    /**
     * 辅助函数：统一从配置中获取当前的 AI 引擎实例
     */
    const getAIProvider = (): AIProvider | null => {
        const config = vscode.workspace.getConfiguration('opengravity');
        const providerType = config.get<string>('provider', 'deepseek');
        const apiKey = config.get<string>('apiKey');

        if (!apiKey) {
            return null;
        }

        return providerType === 'gemini' 
            ? new GeminiProvider(apiKey) 
            : new DeepSeekProvider(apiKey);
    };

    // --- 2. 注册侧边栏聊天视图 ---
    const sidebarProvider = new ChatViewProvider(context.extensionUri, getAIProvider);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType, 
            sidebarProvider
        )
    );

    // --- 3. 修复并保留 opengravity.ask 命令 (适配流式接口) ---
    let askCommand = vscode.commands.registerCommand('opengravity.ask', async () => {
        const provider = getAIProvider();

        if (!provider) {
            vscode.window.showErrorMessage('API Key is not configured. Please set it in your settings.');
            return;
        }

        const userInput = await vscode.window.showInputBox({
            prompt: "Ask Opengravity anything..."
        });

        if (!userInput) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Opengravity is thinking...",
            cancellable: true
        }, async () => {
            try {
                // 因为 ask 命令是显示在一个新文件里，我们需要把流式的内容积攒起来
                let fullContent = "";
                
                await provider.generateContentStream(
                    userInput, 
                    (update) => {
                        // 过滤掉思考过程，只保留正文
                        if (update.type === 'content') {
                            fullContent += update.delta;
                        }
                    }
                    // 这里可以传 systemPrompt，暂时省略或设为 undefined
                );

                const doc = await vscode.workspace.openTextDocument({
                    content: fullContent,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

            } catch (error: any) {
                vscode.window.showErrorMessage(`AI Error: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(askCommand);
}

export function deactivate() {}