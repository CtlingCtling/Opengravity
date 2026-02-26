const vscode = acquireVsCodeApi();

// --- Initialization: AnsiUp ---
let ansiUp = null;
try {
    // 检查 ansi_up 是否成功加载
    if (typeof AnsiUp !== 'undefined') {
        ansiUp = new AnsiUp();
    } else {
        console.warn("AnsiUp not found, falling back to plain text.");
    }
} catch (e) {
    console.error("AnsiUp init error:", e);
}

// --- DOM Elements ---
const chatBox = document.getElementById('chat-box');
const inputArea = document.getElementById('input');

// --- Global State ---
let currentStreamMsg = null;
let markdownBuffer = "";

// --- Input Handling ---
function performSend() {
    const text = inputArea.value.trim();
    if (text) {
        appendMessage('user', text);
        vscode.postMessage({ type: 'userInput', value: text });
        inputArea.value = '';
        inputArea.style.height = 'auto';
    }
}

inputArea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
});

inputArea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        performSend();
    }
});

// --- Message Rendering ---
function appendMessage(role, text = "") {
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${role}`;
    
    msgDiv.innerHTML = `
        <div class="role-label">${role === 'user' ? 'USER' : 'OPENGRAVITY'}</div>
        <div class="reasoning"></div>
        <div class="content"></div>
        <!-- 隔离区域 -->
        <div class="attachments"></div>
    `;

    const contentDiv = msgDiv.querySelector('.content');
    if (text) {
        // [安全修复] 即使是 User 消息也通过 DOMPurify 过滤，或者保持 escapeHtml
        contentDiv.innerHTML = role === 'user' ? escapeHtml(text) : safeParseMarkdown(text);
    }

    chatBox.appendChild(msgDiv);
    scrollToBottom();

    return {
        element: msgDiv,
        content: contentDiv,
        attachments: msgDiv.querySelector('.attachments')
    };
}

function safeParseMarkdown(text) {
    try {
        const rawHtml = marked.parse(text);
        // [安全修复] 增加 DOMPurify 是否存在的检查
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(rawHtml);
        }
        console.warn("DOMPurify not found, rendering raw markdown (XSS Risk!)");
        return rawHtml;
    } catch (e) {
        console.error("Markdown parse error:", e);
        const fallback = text.replace(/\n/g, '<br>');
        return (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(fallback) : fallback;
    }
}

function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// --- Thinking Process (Reasoning) ---
function getOrCreateReasoning(msgObj) {
    let reasoningBlock = msgObj.element.querySelector('.reasoning');
    if (!reasoningBlock.innerHTML) {
        reasoningBlock.className = 'reasoning open';
        reasoningBlock.innerHTML = `
            <div class="reasoning-toggle">
                <span class="reasoning-icon">▶</span> <span>Thinking Process</span>
            </div>
            <div class="reasoning-content"></div>
        `;
        reasoningBlock.querySelector('.reasoning-toggle').onclick = () => {
            reasoningBlock.classList.toggle('open');
            scrollToBottom();
        };
    }
    return reasoningBlock.querySelector('.reasoning-content');
}

// --- Terminal Rendering (隔离在 attachments 中) ---
function getOrCreateTerminal(msgObj) {
    let termBlock = msgObj.attachments.querySelector('.terminal-block');
    if (!termBlock) {
        termBlock = document.createElement('div');
        termBlock.className = 'terminal-block';
        termBlock.innerHTML = `
            <div class="terminal-header">
                <span>Terminal</span>
                <div class="term-status"><div class="status-indicator running"></div></div>
            </div>
            <div class="terminal-body"></div>
        `;
        msgObj.attachments.appendChild(termBlock);
    }
    return termBlock.querySelector('.terminal-body');
}

// --- Approval Widget (隔离在 attachments 中) ---
function showApprovalWidget(msgObj) {
    if (msgObj.attachments.querySelector('.approval-widget')) return;

    const widget = document.createElement('div');
    widget.className = 'approval-widget';
    widget.innerHTML = `
        <div class="approval-title">✨ Code Change Request</div>
        <div class="approval-buttons">
            <button class="btn btn-primary" id="btn-approve">Accept Changes</button>
            <button class="btn btn-danger" id="btn-reject">Reject</button>
        </div>
    `;

    widget.querySelector('#btn-approve').onclick = () => {
        vscode.postMessage({ type: 'applyLastDiff' });
        widget.remove();
    };
    widget.querySelector('#btn-reject').onclick = () => {
        vscode.postMessage({ type: 'cancelLastDiff' });
        widget.remove();
    };

    msgObj.attachments.appendChild(widget);
    scrollToBottom();
}

// --- Message Handler ---
window.addEventListener('message', event => {
    const msg = event.data;

    switch (msg.type) {
        case 'streamStart':
            currentStreamMsg = appendMessage('ai');
            markdownBuffer = "";
            break;

        case 'streamUpdate':
            if (!currentStreamMsg) return;

            if (msg.dataType === 'reasoning') {
                const reasoningContent = getOrCreateReasoning(currentStreamMsg);
                reasoningContent.textContent += msg.value;
            } else if (msg.dataType === 'terminal') {
                // 终端数据：追加到隔离的 terminal-block 中
                const termBody = getOrCreateTerminal(currentStreamMsg);
                if (ansiUp) {
                    termBody.innerHTML += ansiUp.ansi_to_html(msg.value);
                } else {
                    termBody.textContent += msg.value;
                }
                termBody.scrollTop = termBody.scrollHeight;
            } else {
                // 文本数据：只更新 content 区域，不再影响其他附件
                markdownBuffer += msg.value;
                currentStreamMsg.content.innerHTML = safeParseMarkdown(markdownBuffer);
            }
            scrollToBottom();
            break;

        case 'streamEnd':
            if (currentStreamMsg) {
                const indicator = currentStreamMsg.attachments.querySelector('.status-indicator');
                if (indicator) {
                    indicator.classList.remove('running');
                    indicator.classList.add('success');
                }
                hljs.highlightAll();
            }
            currentStreamMsg = null;
            break;

        case 'showApprovalPanel':
            // 总是附加到最新的 AI 消息
            const aiMsgs = document.querySelectorAll('.msg.ai');
            if (aiMsgs.length > 0) {
                const lastAi = aiMsgs[aiMsgs.length - 1];
                showApprovalWidget({ 
                    element: lastAi, 
                    attachments: lastAi.querySelector('.attachments') 
                });
            }
            break;
            
        case 'restoreHistory':
            chatBox.innerHTML = '';
            msg.value.forEach(m => appendMessage(m.role === 'ai' ? 'ai' : 'user', m.content));
            break;
            
        case 'fillInput':
            inputArea.value = msg.value;
            inputArea.focus();
            break;

        case 'clearView':
            chatBox.innerHTML = '';
            break;
    }
});

// Signal ready
vscode.postMessage({ type: 'webviewLoaded' });

// --- Global Key Listeners ---
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // [紧急阻断] 通知后台停止一切工作
        vscode.postMessage({ type: 'abortTask' });
    }
});