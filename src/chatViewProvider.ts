import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIProvider } from './provider';
import { loadSystemPrompt } from './utils/promptLoader';

// 定义消息结构
interface ChatMessage {
    role: 'user' | 'ai';
    content: string;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'opengravity.chatView';
    private _view?: vscode.WebviewView;
    private _chatHistory: ChatMessage[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getAIProvider: () => AIProvider | null
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        // 配置 Webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // 设置 HTML 内容
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 监听前端发来的消息
        webviewView.webview.onDidReceiveMessage(async (data) => {
            // 【新增】处理前端加载完成事件
            if (data.type === 'webviewLoaded') {
                if (this._chatHistory.length > 0) {
                    // 前端醒了，把历史记录发过去
                    await webviewView.webview.postMessage({ 
                        type: 'restoreHistory', 
                        value: this._chatHistory 
                    });
                }
            } 
            // 处理用户输入
            else if (data.type === 'userInput') {
                await this.handleUserMessage(data.value);
            }
        });
    }

    /**
     * 处理用户发送的消息
     */
    private async handleUserMessage(content: string) {
        if (!this._view) return;

        // 1. 记录并显示用户消息
        this._chatHistory.push({ role: 'user', content });
        
        // 获取 AI 引擎
        const provider = this._getAIProvider();
        if (!provider) {
            this._view.webview.postMessage({ type: 'error', value: 'API Key Missing! Please configure it in Settings.' });
            return;
        }

        try {
            // 加载系统提示词
            const systemPrompt = await loadSystemPrompt();
            
            // 通知前端：AI 开始输出了
            this._view.webview.postMessage({ type: 'streamStart' });

            let fullContent = "";

            // 2. 调用 AI (流式)
            await provider.generateContentStream(
                content,
                (update) => {
                    // 实时发给前端显示
                    this._view?.webview.postMessage({ 
                        type: 'streamUpdate', 
                        dataType: update.type, 
                        value: update.delta 
                    });

                    // 只有正文部分需要拼接起来，用于后续分析指令
                    if (update.type === 'content') {
                        fullContent += update.delta;
                    }
                },
                systemPrompt
            );

            // 3. 记录 AI 的完整回复
            this._chatHistory.push({ role: 'ai', content: fullContent });
            this._view.webview.postMessage({ type: 'streamEnd' });

            // 4. 【关键】检查 AI 回复里有没有藏着文件操作指令
            await this.processToolCalls(fullContent);

        } catch (err: any) {
            this._view.webview.postMessage({ type: 'error', value: `Error: ${err.message}` });
        }
    }

    /**
     * 解析并执行文件操作指令
     */
    private async processToolCalls(aiResponse: string) {
        // 获取当前工作区路径
        if (!vscode.workspace.workspaceFolders) return;
        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

        // --- A. 解析读取指令 [[READ:路径]] ---
        const readRegex = /\[\[READ:\s*(.*?)\]\]/g;
        let match;
        
        while ((match = readRegex.exec(aiResponse)) !== null) {
            const relPath = match[1].trim();
            const fullPath = path.join(rootPath, relPath);

            // 弹窗询问权限
            const permission = await vscode.window.showInformationMessage(
                `TARS 请求读取文件: ${relPath}`, '允许', '拒绝'
            );

            if (permission === '允许') {
                try {
                    if (fs.existsSync(fullPath)) {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        // 【闭环】读取成功后，自动把内容发回给 AI，就像用户发消息一样
                        await this.handleUserMessage(`[系统自动回复] 文件 ${relPath} 的内容如下:\n\`\`\`\n${content}\n\`\`\``);
                    } else {
                        vscode.window.showErrorMessage(`文件不存在: ${relPath}`);
                    }
                } catch (e: any) {
                    vscode.window.showErrorMessage(`读取失败: ${e.message}`);
                }
            }
        }

        // --- B. 解析写入指令 [[WRITE:路径]] 内容 [[END]] ---
        const writeRegex = /\[\[WRITE:\s*(.*?)\]\]([\s\S]*?)\[\[END\]\]/g;
        
        while ((match = writeRegex.exec(aiResponse)) !== null) {
            const relPath = match[1].trim();
            let fileContent = match[2].trim();
            const fullPath = path.join(rootPath, relPath);

            // 清理代码块标记 (去掉开头的 ```cpp 和结尾的 ```)
            fileContent = fileContent.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');

            // 弹窗询问权限 (写入是危险操作，用 Warning)
            const permission = await vscode.window.showWarningMessage(
                `TARS 请求修改/创建文件: ${relPath}`, '允许写入', '拒绝'
            );

            if (permission === '允许写入') {
                try {
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    
                    fs.writeFileSync(fullPath, fileContent, 'utf-8');
                    vscode.window.showInformationMessage(`✅ 文件 ${relPath} 已保存！`);
                    
                    // 自动打开文件给用户看
                    const doc = await vscode.workspace.openTextDocument(fullPath);
                    await vscode.window.showTextDocument(doc);
                } catch (e: any) {
                    vscode.window.showErrorMessage(`写入失败: ${e.message}`);
                }
            }
        }
    }

    // --- 前端 HTML/CSS/JS (TUI 风格) ---
    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        /* 全局变量：适配 VS Code 主题 */
        :root {
            --bg: var(--vscode-sideBar-background);
            --fg: var(--vscode-terminal-foreground);
            --border: var(--vscode-panel-border);
            --user-color: var(--vscode-terminal-ansiCyan);
            --ai-color: var(--vscode-terminal-ansiGreen);
            --gray: #666;
        }

        body {
            margin: 0; padding: 0; height: 100vh; overflow: hidden;
            background-color: var(--bg); color: var(--fg);
            font-family: 'JetBrains Mono', 'Consolas', monospace;
            font-size: 13px; line-height: 1.5;
            display: flex; flex-direction: column;
        }

        /* 聊天记录区域 */
        #chat-box {
            flex: 1; overflow-y: auto; padding: 15px;
            display: flex; flex-direction: column; gap: 15px;
        }

        /* 消息块 */
        .msg { padding-left: 10px; border-left: 2px solid transparent; }
        .msg-user { border-left-color: var(--user-color); }
        .msg-ai { border-left-color: var(--ai-color); }

        .role { font-weight: bold; margin-bottom: 5px; opacity: 0.8; font-size: 0.9em; }
        .user-role { color: var(--user-color); }
        .ai-role { color: var(--ai-color); }

        /* 思考过程 (Log 风格) */
        .reasoning {
            margin-bottom: 8px; padding: 8px;
            border: 1px dashed var(--gray); background: rgba(255,255,255,0.05);
            color: var(--gray); font-size: 0.9em; white-space: pre-wrap;
            display: none;
        }

        /* Markdown 样式微调 */
        pre { background: #111; padding: 8px; border: 1px solid #333; overflow-x: auto; }
        code { font-family: inherit; color: #d7ba7d; }
        p { margin: 5px 0; }

        /* 输入框区域 */
        #input-area {
            padding: 10px; border-top: 1px solid var(--border);
            background: var(--bg);
        }
        .input-wrapper {
            display: flex; border: 1px solid var(--border); padding: 5px; background: rgba(0,0,0,0.2);
        }
        .prompt { color: var(--ai-color); margin-right: 8px; font-weight: bold; }
        textarea {
            flex: 1; background: transparent; border: none; color: inherit;
            font-family: inherit; resize: none; outline: none; max-height: 100px;
        }
        .hint { font-size: 10px; color: var(--gray); text-align: right; margin-top: 4px; }
    </style>
</head>
<body>
    <div id="chat-box">
        <div class="msg msg-ai">
            <div class="role ai-role">[SYSTEM]</div>
            <div>TARS Online. Ready.</div>
        </div>
    </div>

    <div id="input-area">
        <div class="input-wrapper">
            <span class="prompt">>></span>
            <textarea id="input" rows="1" placeholder="Type instructions..."></textarea>
        </div>
        <div class="hint">Option + Enter to send</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatBox = document.getElementById('chat-box');
        const input = document.getElementById('input');

        // 自动调整高度
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });

        // 快捷键发送
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.altKey) {
                e.preventDefault();
                const text = input.value.trim();
                if (!text) return;
                
                appendMsg('user', text);
                vscode.postMessage({ type: 'userInput', value: text });
                input.value = '';
                input.style.height = 'auto';
            }
        });

        let currentReasoning = null;
        let currentContent = null;
        let mdBuffer = "";

        function appendMsg(role, text) {
            const div = document.createElement('div');
            div.className = 'msg msg-' + role;
            const roleLabel = role === 'user' ? 'USER' : 'TARS';
            const roleClass = role === 'user' ? 'user-role' : 'ai-role';
            
            // 用户消息直接显示纯文本
            if (role === 'user') {
                div.innerHTML = \`<div class="role \${roleClass}">[\${roleLabel}]</div><div>\${text}</div>\`;
            } else {
                // AI 消息预留结构
                div.innerHTML = \`
                    <div class="role \${roleClass}">[\${roleLabel}]</div>
                    <div class="reasoning"></div>
                    <div class="content"></div>
                \`;
            }
            chatBox.appendChild(div);
            chatBox.scrollTop = chatBox.scrollHeight;
            return div;
        }

        window.addEventListener('message', event => {
            const msg = event.data;

            if (msg.type === 'streamStart') {
                const div = appendMsg('ai', '');
                currentReasoning = div.querySelector('.reasoning');
                currentContent = div.querySelector('.content');
                mdBuffer = "";
            } 
            else if (msg.type === 'streamUpdate') {
                if (msg.dataType === 'reasoning') {
                    currentReasoning.style.display = 'block';
                    currentReasoning.textContent += msg.value;
                } else {
                    mdBuffer += msg.value;
                    currentContent.innerHTML = marked.parse(mdBuffer);
                }
                chatBox.scrollTop = chatBox.scrollHeight;
            }
            else if (msg.type === 'restoreHistory') {
                chatBox.innerHTML = '';
                msg.value.forEach(m => {
                    const div = appendMsg(m.role, m.content);
                    if (m.role === 'ai') {
                        div.querySelector('.content').innerHTML = marked.parse(m.content);
                    }
                });
            }
            else if (msg.type === 'error') {
                const div = document.createElement('div');
                div.className = 'msg msg-ai';
                div.innerHTML = \`<div style="color:red">[ERROR] \${msg.value}</div>\`;
                chatBox.appendChild(div);
            }
        });
        vscode.postMessage({ type: 'webviewLoaded' });
    </script>
</body>
</html>`;
    }
}