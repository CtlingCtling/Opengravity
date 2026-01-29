/*
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "opengravity" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('opengravity.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from opengravity!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
*/

import * as vscode from 'vscode';
// 从我们自己的 provider.ts 文件里，导入需要的类
import { AIProvider, DeepSeekProvider, GeminiProvider } from './provider';

// 这是插件被激活时运行的主函数
export function activate(context: vscode.ExtensionContext) {

    console.log('Congratulations, your extension "opengravity" is now active!');

    // 注册一个命令 `opengravity.ask`
    let disposable = vscode.commands.registerCommand('opengravity.ask', async () => {
        
        // --- 1. 从 VS Code 设置里读取用户的配置 ---
        const config = vscode.workspace.getConfiguration('opengravity');
        const providerType = config.get<string>('provider', 'deepseek');
        // const apiKey = process.env.DEEPSEEK_API_KEY;
        const apiKey = config.get<string>('apiKey');

        if (!apiKey) {
            vscode.window.showErrorMessage('API Key is not configured. Please set it in your settings.');
            return;
        }

        // --- 2. 根据配置，选择要使用的“引擎” ---
        let provider: AIProvider;
        if (providerType === 'gemini') {
            provider = new GeminiProvider(apiKey); // 将来用
        } else {
            provider = new DeepSeekProvider(apiKey); // 现在用
        }
        
        // --- 3. 弹出输入框，让用户提问 ---
        const userInput = await vscode.window.showInputBox({
            prompt: "Ask Opengravity anything..."
        });

        if (!userInput) {
            return; // 用户取消了输入
        }

        // --- 4. 调用 AI 引擎并显示加载动画 ---
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Opengravity is thinking...",
            cancellable: true
        }, async (progress, token) => {
            
            // 【核心调用】
            const response = await provider.generateContent(userInput);

            // --- 5. 把结果显示在一个新的编辑器窗口里 ---
            const doc = await vscode.workspace.openTextDocument({
                content: response,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        });
    });

    // 把注册的命令加到“订阅”里，确保插件卸载时能被清理
    context.subscriptions.push(disposable);
}

// 插件被禁用时运行
export function deactivate() {}