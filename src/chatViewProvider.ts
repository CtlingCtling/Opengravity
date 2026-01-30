import * as vscode from 'vscode';
import { AIProvider } from './provider';
// 【修改】引入你写好的工具函数
import { loadSystemPrompt } from './utils/promptLoader';

// 定义消息接口
interface ChatMessage {
    role: 'user' | 'ai';
    content: string;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'opengravity.chatView';
    private _view?: vscode.WebviewView;
    
    // 内存中的历史记录
    private _chatHistory: ChatMessage[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getAIProvider: () => AIProvider | null
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 视图加载时，恢复历史记录
        if (this._chatHistory.length > 0) {
            webviewView.webview.postMessage({ type: 'restoreHistory', value: this._chatHistory });
        }

        // 监听前端消息
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'userInput': {
                    const provider = this._getAIProvider();
                    
                    // 1. 记录用户消息
                    const userMsg: ChatMessage = { role: 'user', content: data.value };
                    this._chatHistory.push(userMsg);

                    if (!provider) {
                        webviewView.webview.postMessage({ type: 'error', value: 'ERR: API KEY NOT FOUND IN SETTINGS' });
                        return;
                    }

                    try {
                        // 【修改】直接调用你封装好的 loadSystemPrompt，不需要传参了
                        // 它会自动按优先级查找 SYSTEM.md
                        const systemPrompt = await loadSystemPrompt();

                        // 3. 通知前端：开始接收流
                        webviewView.webview.postMessage({ type: 'streamStart' });

                        // 4. 调用流式接口
                        let fullContent = "";
                        await provider.generateContentStream(
                            data.value,
                            (update) => {
                                // 实时转发给前端
                                webviewView.webview.postMessage({ 
                                    type: 'streamUpdate', 
                                    dataType: update.type, // 'reasoning' | 'content'
                                    value: update.delta 
                                });
                                
                                // 后端只收集正文用于存储
                                if (update.type === 'content') {
                                    fullContent += update.delta;
                                }
                            },
                            systemPrompt
                        );

                        // 5. 记录 AI 完整回复
                        this._chatHistory.push({ role: 'ai', content: fullContent });
                        
                        // 6. 结束流
                        webviewView.webview.postMessage({ type: 'streamEnd' });

                    } catch (err: any) {
                        webviewView.webview.postMessage({ type: 'error', value: `SYS_ERR: ${err.message}` });
                    }
                    break;
                }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // TUI 风格 HTML/CSS 保持不变
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        :root {
            --term-bg: #0c0c0c;
            --term-user: #00ffff; /* 青色 */
            --term-ai: #00ff00;   /* 绿色 */
            --term-gray: #666666;
            --term-border: #333333;
            --font-mono: 'Consolas', 'Courier New', monospace;
        }

        body {
            background-color: var(--term-bg);
            color: #cccccc;
            font-family: var(--font-mono);
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: #333; }
        ::-webkit-scrollbar-track { background: #000; }

        #terminal-output {
            flex: 1;
            padding: 10px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        /* 消息块样式 */
        .msg-block {
            border: 1px solid transparent;
            padding: 5px;
            position: relative;
        }

        .role-label {
            font-size: 0.8em;
            font-weight: bold;
            margin-bottom: 5px;
            display: inline-block;
            padding: 0 4px;
            border: 1px solid;
        }

        /* 用户消息 */
        .msg-user .role-label {
            color: var(--term-bg);
            background-color: var(--term-user);
            border-color: var(--term-user);
        }
        .msg-user .content {
            color: var(--term-user);
            border-left: 2px solid var(--term-user);
            padding-left: 8px;
            white-space: pre-wrap;
        }

        /* AI 消息 */
        .msg-ai .role-label {
            color: var(--term-bg);
            background-color: var(--term-ai);
            border-color: var(--term-ai);
        }
        .msg-ai .content {
            color: #eeeeee;
            border-left: 2px solid var(--term-ai);
            padding-left: 8px;
        }

        /* 错误消息 */
        .msg-error {
            color: #ff3333;
            border: 1px dashed #ff3333;
            padding: 10px;
        }

        /* 思考过程 (Log样式) */
        .reasoning-box {
            font-family: var(--font-mono);
            font-size: 0.85em;
            color: var(--term-gray);
            border: 1px dashed var(--term-gray);
            background: #111;
            padding: 8px;
            margin-bottom: 8px;
            display: none; 
        }
        .reasoning-header {
            text-transform: uppercase;
            border-bottom: 1px dashed var(--term-gray);
            margin-bottom: 4px;
            padding-bottom: 2px;
        }

        /* Markdown 样式 */
        .content p { margin: 5px 0; }
        .content pre { 
            background: #1a1a1a; 
            border: 1px solid #444; 
            padding: 10px; 
            overflow-x: auto;
        }
        .content code {
            font-family: var(--font-mono);
            background: #222;
            padding: 2px 4px;
        }

        /* 输入框区域 */
        #input-area {
            background: #000;
            border-top: 1px solid var(--term-border);
            padding: 10px;
        }
        
        .cmd-line {
            display: flex;
            align-items: flex-start;
            border: 1px solid var(--term-gray);
            background: #111;
            padding: 5px;
        }
        
        .prompt-char {
            color: var(--term-ai);
            margin-right: 8px;
            font-weight: bold;
            padding-top: 2px;
            user-select: none;
        }

        textarea {
            flex: 1;
            background: transparent;
            border: none;
            color: #fff;
            font-family: var(--font-mono);
            font-size: 13px;
            resize: none;
            outline: none;
            min-height: 20px;
        }
        
        .status-bar {
            font-size: 10px;
            color: var(--term-gray);
            margin-top: 4px;
            text-align: right;
        }

    </style>
</head>
<body>
    <div id="terminal-output">
        <div class="msg-block">
            <div style="color: var(--term-ai)">
                Opengravity OS v1.0<br>
                [SYSTEM] Ready for input...
            </div>
        </div>
    </div>

    <div id="input-area">
        <div class="cmd-line">
            <span class="prompt-char">>></span>
            <textarea id="user-input" rows="1" placeholder="Enter instructions..."></textarea>
        </div>
        <div class="status-bar">CTRL+ENTER to SEND</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const outputDiv = document.getElementById('terminal-output');
        const inputField = document.getElementById('user-input');

        inputField.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                const text = inputField.value.trim();
                if (!text) return;
                appendUserMessage(text);
                vscode.postMessage({ type: 'userInput', value: text });
                inputField.value = '';
                inputField.style.height = 'auto';
            }
        });

        function appendUserMessage(text) {
            const div = document.createElement('div');
            div.className = 'msg-block msg-user';
            div.innerHTML = \`
                <div class="role-label">USER</div>
                <div class="content">\${text}</div>
            \`;
            outputDiv.appendChild(div);
            scrollToBottom();
        }

        let activeReasoningElem = null;
        let activeContentElem = null;
        let activeFullText = "";

        window.addEventListener('message', event => {
            const msg = event.data;

            if (msg.type === 'streamStart') {
                const wrapper = document.createElement('div');
                wrapper.className = 'msg-block msg-ai';
                wrapper.innerHTML = \`
                    <div class="role-label">GRAVITY</div>
                    <div class="reasoning-box">
                        <div class="reasoning-header">// THOUGHT STREAM</div>
                        <div class="reasoning-content"></div>
                    </div>
                    <div class="content"></div>
                \`;
                outputDiv.appendChild(wrapper);
                activeReasoningElem = wrapper.querySelector('.reasoning-content');
                activeContentElem = wrapper.querySelector('.content');
                activeFullText = "";
                scrollToBottom();
            }
            else if (msg.type === 'streamUpdate') {
                if (msg.dataType === 'reasoning') {
                    activeReasoningElem.parentElement.style.display = 'block';
                    activeReasoningElem.textContent += msg.value;
                } else {
                    activeFullText += msg.value;
                    activeContentElem.innerHTML = marked.parse(activeFullText);
                }
                scrollToBottom();
            }
            else if (msg.type === 'streamEnd') {
                activeReasoningElem = null;
                activeContentElem = null;
                activeFullText = "";
            }
            else if (msg.type === 'restoreHistory') {
                outputDiv.innerHTML = ''; 
                msg.value.forEach(m => {
                    if (m.role === 'user') {
                        appendUserMessage(m.content);
                    } else {
                        const div = document.createElement('div');
                        div.className = 'msg-block msg-ai';
                        div.innerHTML = \`
                            <div class="role-label">GRAVITY</div>
                            <div class="content">\${marked.parse(m.content)}</div>
                        \`;
                        outputDiv.appendChild(div);
                    }
                });
                scrollToBottom();
            }
            else if (msg.type === 'error') {
                const div = document.createElement('div');
                div.className = 'msg-block msg-error';
                div.textContent = msg.value;
                outputDiv.appendChild(div);
            }
        });

        function scrollToBottom() {
            outputDiv.scrollTop = outputDiv.scrollHeight;
        }
    </script>
</body>
</html>`;
    }
}