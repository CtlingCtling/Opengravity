import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIProvider, ApiMessage } from './provider';
import { McpHost } from './mcp/mcpHost';
import { ToolExecutor } from './tools/executor';
import { OPGV_TOOLS } from './tools/definitions';
import { Logger } from './utils/logger';
import { CommandDispatcher } from './commands/CommandDispatcher';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'opengravity.chatView';
    private _view?: vscode.WebviewView;
    private _apiMessages: ApiMessage[] = [];
    private _recursionDepth = 0;
    private static MAX_RECURSION_DEPTH = 5;
    private _commandDispatcher: CommandDispatcher;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getAIProvider: () => AIProvider | null,
        private readonly _mcpHost: McpHost,
        private readonly _systemPrompt: string
    ) {
        this._commandDispatcher = new CommandDispatcher();
    }

    public async resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        await this.loadSessionFromDisk();

        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewLoaded':
                    if (this._apiMessages.length > 0) {
                        this._postWebviewMessage('restoreHistory', this._apiMessages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.content).map(m => ({ role: m.role === 'assistant' ? 'ai' : 'user', content: m.content || "" })));
                    }
                    break;
                case 'userInput':
                    await this.handleUserMessage(data.value);
                    break;
                case 'linkActiveFile':
                    await this.handleLinkActiveFile();
                    break;
                case 'saveAndClear':
                    await this.handleSaveAndClear();
                    break;
                case 'insertCode':
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        editor.edit(b => b.insert(editor.selection.active, data.value));
                    }
                    break;
                case 'applyDiff':
                    vscode.commands.executeCommand('opengravity.showDiff', data.value);
                    break;
                case 'runTerminal':
                    const t = vscode.window.activeTerminal || vscode.window.createTerminal("OPGV");
                    t.show(); t.sendText(data.value);
                    break;
                case 'fillInput':
                    break;
            }
        });
    }

    private async handleUserMessage(content: string, isToolResponse: boolean = false) {
        if (!this._view) {
            return;
        }
        const provider = this._getAIProvider();
        if (!provider) {
            this._postWebviewMessage('error', 'API key missing');
            return;
        }

        // --- 指令拦截钩子 ---
        if (!isToolResponse && content) {
            const dispatchResult = await this._commandDispatcher.dispatch(
                content,
                provider,
                this._mcpHost,
                this._view.webview,
                this._extensionUri,
                async (fakeMsg) => {
                    // 用于注入合成消息的回调逻辑（TOML用）
                    await this._storeUserMessage(fakeMsg);
                    await this.handleUserMessage("", true);
                }
            );

            // 如果指令已执行并被消费，则停止后续 AI 流
            if (dispatchResult) {
                if (dispatchResult.status === 'error') {
                    this._postWebviewMessage('error', dispatchResult.message);
                }
                return;
            }
        }
        // ------------------

        if (isToolResponse) {
            this._recursionDepth++;
        } else {
            this._recursionDepth = 0;
        }

        if (this._recursionDepth > ChatViewProvider.MAX_RECURSION_DEPTH) {
            const errMessage = `[OPGV] Recursion depth exceeded (${ChatViewProvider.MAX_RECURSION_DEPTH}). Stopping tool auto-resuming to prevent infinite loops.`;
            Logger.error(errMessage);
            this._postWebviewMessage('error', 'Maximum recursion depth reached. Possible infinite tool execution loop.');
            this._recursionDepth = 0;
            return;
        }

        this._ensureSystemPrompt();
        if (content && !isToolResponse) {
            await this._storeUserMessage(content);
        }

        try {
            this._postWebviewMessage('streamStart', undefined);
            const allTools = await this._getAvailableTools();
            const aiResponse = await this._getAIResponse(provider, this._apiMessages, allTools);

            this._apiMessages.push(aiResponse);
            this._postWebviewMessage('streamEnd', undefined);
            await this.saveSessionToDisk();

            if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
                await this._executeToolCalls(aiResponse.tool_calls);
                Logger.info("[OPGV] All tools done. Auto-resuming...");
                await this.handleUserMessage("", true);
            }
        } catch (err: any) { 
            this._handleProcessingError(err);
        }
    }

    private _postWebviewMessage(type: string, value: any, dataType?: string) {
        if (this._view) {
            this._view.webview.postMessage({ type, value, dataType });
        }
    }

    private _handleProcessingError(err: any) {
        Logger.error("[OPGV] Error in handleUserMessage: ", err);
        this._postWebviewMessage('error', err.message || 'An unknown error occurred.');
    }

    private async handleLinkActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const prompt = `[CONTEXT: \`${path.basename(editor.document.fileName)}\`]\n\`\`\`\n${editor.document.getText()}\n\`\`\`\n\n`;
        this._postWebviewMessage('fillInput', prompt);
    }

    private async handleSaveAndClear() {
        if (this._apiMessages.length <= 1) {
            return;
        }
        const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!root) {
            return;
        }
        const savePath = path.join(root, 'reviews', `archive_${Date.now()}.md`);
        let output = "# Archive\n\n";
        this._apiMessages.forEach(m => { 
            if (m.content) {
                output += `### [${m.role.toUpperCase()}]\n${m.content}\n\n---\n\n`; 
            }
        });
        try {
            await fs.promises.mkdir(path.dirname(savePath), { recursive: true });
            await fs.promises.writeFile(savePath, output, 'utf-8');
            this._apiMessages = [];
            const hp = this.getHistoryPath();
            if (hp) {
                try {
                    await fs.promises.access(hp); // Check if file exists
                    await fs.promises.unlink(hp); // Unlink if it exists
                } catch (e: any) {
                    // File might not exist or other access error, which is fine for unlink
                    if (e.code !== 'ENOENT') { // Ignore 'No such file or directory' error
                        Logger.error("[OPGV] Error unlinking session history:", e);
                    }
                }
            }
            this._postWebviewMessage('clearView', undefined);
        } catch (e: any) { vscode.window.showErrorMessage(e.message); }
    }

    private getHistoryPath() {
        const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        return root ? path.join(root, '.opengravity', 'session_history.json') : undefined;
    }

    private async saveSessionToDisk() {
        const hp = this.getHistoryPath();
        if (hp) {
            await fs.promises.mkdir(path.dirname(hp), { recursive: true });
            await fs.promises.writeFile(hp, JSON.stringify(this._apiMessages, null, 2), 'utf-8');
        }
    }

    private async loadSessionFromDisk() {
        const hp = this.getHistoryPath();
        if (hp) {
            try {
                await fs.promises.access(hp);
                this._apiMessages = JSON.parse(await fs.promises.readFile(hp, 'utf-8'));
            } catch (e: any) {
                if (e.code !== 'ENOENT') {
                    Logger.error("[OPGV] Error loading session history:", e);
                }
                this._apiMessages = [];
            }
        }
    }

    // 新增辅助方法: 确保系统提示词已添加到消息列表，并注入可用的MCP提示词描述
    private async _ensureSystemPrompt() {
        if (this._apiMessages.length === 0) {
            let systemContent = this._systemPrompt;
            
            // 提取并注入可用的 MCP Prompts 信息
            const mcpPrompts = await this._mcpHost.getPromptsForAI();
            if (mcpPrompts.length > 0) {
                systemContent += "\n\n## Available MCP Prompts:\n";
                mcpPrompts.forEach(p => {
                    systemContent += `- [${p.serverName}] ${p.name}: ${p.description}\n`;
                });
                systemContent += "\nYou can use the `get_mcp_prompt` tool to get the content of these templates.";
            }

            // 提取并注入可用的 MCP Resources 信息
            const mcpResources = await this._mcpHost.getResourcesForAI();
            if (mcpResources.length > 0) {
                systemContent += "\n\n## Available MCP Resources:\n";
                mcpResources.forEach(r => {
                    systemContent += `- [${r.serverName}] ${r.name} (URI: ${r.uri}): ${r.description}\n`;
                });
                systemContent += "\nYou can use the `get_mcp_resource` tool with the appropriate URI to get the content of these resources.";
            }

            this._apiMessages.push({ role: 'system', content: systemContent });
        }
    }

    // 新增辅助方法: 存储用户消息并保存会话到磁盘
    private async _storeUserMessage(content: string) {
        this._apiMessages.push({ role: 'user', content });
        await this.saveSessionToDisk();
    }

    private async _getAvailableTools(): Promise<any[]> {
        const mcpTools = await this._mcpHost.getToolsForAI();
        const opgvTools = OPGV_TOOLS;
        return [...mcpTools, ...opgvTools];
    }

    private async _getAvailablePrompts(): Promise<any[]> {
        return await this._mcpHost.getPromptsForAI();
    }

    private async _getAIResponse(provider: AIProvider, messages: ApiMessage[], allTools: any[]): Promise<ApiMessage> {
        return await provider.generateContentStream(
            messages,
            (update) => {
                this._postWebviewMessage(
                    'streamUpdate',
                    update.delta,
                    update.type
                );
            },
            allTools
        );
    }

    private async _executeToolCalls(toolCalls: any[]) {
        this._postWebviewMessage(
            'streamUpdate', 
            `\n\n> 🔧 **OPGV Action:** Executing ${toolCalls.length} tools...\n`, 
            'content'
        );
        for (const toolCall of toolCalls) {
            let result = "";
            const funcName = toolCall.function.name;
            let args;
            try {
                args = JSON.parse(toolCall.function.arguments);
            } catch (e: any) {
                Logger.error(`[OPGV] Error parsing tool call arguments for ${funcName}:`, e);
                result = JSON.stringify({
                    error: `Failed to parse arguments for tool '${funcName}'. Ensure arguments are valid JSON. Error: ${e.message}`,
                    rawArguments: toolCall.function.arguments
                });
                this._apiMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: result
                });
                // Continue to next tool call if parsing failed for this one
                continue; 
            }
            if (funcName === 'read_file') {
                result = await ToolExecutor.read_file(args);
            } else if (funcName === 'write_file') {
                result = await ToolExecutor.write_file(args);
            } else if (funcName === 'run_command') {
                result = await ToolExecutor.run_command(args);
            } else if (funcName === 'get_mcp_prompt') {
                result = await this._mcpHost.getPromptContent(args.server_name, args.prompt_name, args.arguments);
            } else if (funcName === 'get_mcp_resource') {
                result = await this._mcpHost.getResourceContent(args.server_name, args.uri);
            } else {
                result = await this._mcpHost.executeTool(funcName, args);
            }
            this._apiMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: result
            });
        }
        await this.saveSessionToDisk();
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.css'));
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.html');
        
        let html = await fs.promises.readFile(htmlPath.fsPath, 'utf8');
        html = html.replace('{{styleUri}}', styleUri.toString());
        html = html.replace('{{scriptUri}}', scriptUri.toString());
        
        return html;
    }
}