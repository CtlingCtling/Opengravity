import * as vscode from 'vscode';
import { loadSystemPrompt } from './utils/promptLoader';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'opengravity.chatView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getAIProvider: () => any
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 监听来自前端的消息
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'userInput': {
                    const provider = this._getAIProvider();
                    
                    if (!provider) {
                        webviewView.webview.postMessage({ type: 'error', value: 'API Key 没配呢，去设置里看看？' });
                        return;
                    }

                    try {
                        // 1. 获取 System Prompt (真相来源)
                        const systemPrompt = await loadSystemPrompt();
                        // 2. 调用 AI
                        const response = await provider.generateContent(data.value, systemPrompt);
                        // 3. 返回结果
                        webviewView.webview.postMessage({ type: 'aiResponse', value: response });
                    } catch (err: any) {
                        webviewView.webview.postMessage({ type: 'error', value: err.message });
                    }
                    break;
                }
            }
        });
    }

    // src/chatViewProvider.ts 里的 _getHtmlForWebview 方法

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        /* TUI 风格全局样式 */
        body, html { 
            margin: 0; padding: 0; height: 100%; overflow: hidden; 
            background-color: var(--vscode-sideBar-background);
            color: var(--vscode-terminal-foreground);
            font-family: var(--vscode-editor-font-family), monospace;
            font-size: 12px;
        }

        #app {
            display: flex; flex-direction: column;
            height: 100vh; width: 100%;
        }

        /* 消息区域：自动撑开，内部滚动 */
        #messages {
            flex: 1; overflow-y: auto; padding: 10px;
            border-bottom: 2px solid var(--vscode-panel-border);
            scrollbar-width: thin;
        }

        .msg { margin-bottom: 15px; border-left: 2px solid transparent; padding-left: 8px; }
        .user { border-left-color: var(--vscode-terminal-ansiCyan); color: var(--vscode-terminal-ansiCyan); }
        .ai { border-left-color: var(--vscode-terminal-ansiGreen); }
        
        /* 角色标签 */
        .role { font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }

        /* 输入区域：固定在底部 */
        #input-container {
            padding: 10px; background: var(--vscode-sideBar-background);
        }

        .input-wrapper {
            display: flex; align-items: flex-start;
            border: 1px solid var(--vscode-panel-border);
            padding: 4px; background: rgba(0,0,0,0.2);
        }

        .prompt-char { color: var(--vscode-terminal-ansiGreen); margin-right: 8px; font-weight: bold; }

        textarea { 
            flex: 1; background: transparent; color: inherit; font-family: inherit;
            border: none; outline: none; resize: none; padding: 0; margin: 0;
            line-height: 1.5;
        }

        /* TUI 代码块 */
        pre { 
            background: #1e1e1e; border: 1px dashed #444; padding: 8px; 
            overflow-x: auto; color: #d4d4d4; 
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
    <div id="app">
        <div id="messages">
            <div class="msg ai">
                <div class="role">[SYSTEM]</div>
                <div>Opengravity Terminal Ready...</div>
            </div>
        </div>
        
        <div id="input-container">
            <div class="input-wrapper">
                <span class="prompt-char">></span>
                <textarea id="input" rows="3" placeholder="TYPE YOUR COMMAND..."></textarea>
            </div>
            <div style="font-size: 9px; opacity: 0.5; margin-top: 4px;">CTRL+ENTER TO EXECUTE</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const inputArea = document.getElementById('input');

        function appendMsg(role, text) {
            const div = document.createElement('div');
            div.className = 'msg ' + role;
            const roleName = role === 'user' ? 'USER' : 'GRAVITY';
            div.innerHTML = \`<div class="role">[\${roleName}]</div><div>\${role === 'ai' ? marked.parse(text) : text}</div>\`;
            messagesDiv.appendChild(div);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        inputArea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                const text = inputArea.value.trim();
                if (!text) return;
                appendMsg('user', text);
                vscode.postMessage({ type: 'userInput', value: text });
                inputArea.value = '';
            }
        });

        window.addEventListener('message', event => {
            if (event.data.type === 'aiResponse') {
                appendMsg('ai', event.data.value);
            }
        });
    </script>
</body>
</html>`;
    }
}