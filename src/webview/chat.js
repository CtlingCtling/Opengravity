const vscode = acquireVsCodeApi();

// --- Components ---

class ChatBox {
    constructor(elementId) {
        this.element = document.getElementById(elementId);
        this.curEof = null;
    }

    appendMessage(role, text) {
        const div = document.createElement('div');
        div.className = 'msg ' + role;
        const label = role === 'user' ? 'USER' : 'OPENGRAVITY';
        div.innerHTML = `
            <div style="font-weight:bold;margin-bottom:5px">[${label}]</div>
            <div class="reasoning"></div>
            <div class="content"></div>
        `;
        if (role === 'user') {
            div.querySelector('.content').textContent = text;
        }
        this.element.appendChild(div);
        this.scrollToBottom();
        return {
            reasoning: div.querySelector('.reasoning'),
            content: div.querySelector('.content'),
            element: div
        };
    }

    clear() {
        this.element.innerHTML = '<div style="color:var(--ai-c)">[SYSTEM] Memory Purged. Archive Created.</div>';
    }

    reset() {
        this.element.innerHTML = '';
    }

    scrollToBottom() {
        this.element.scrollTop = this.element.scrollHeight;
    }

    removeEof() {
        if (this.curEof) {
            this.curEof.remove();
            this.curEof = null;
        }
    }

    addEof(element) {
        const eofTag = document.createElement('span');
        eofTag.textContent = ' [EOF]';
        eofTag.style.color = 'var(--gray)';
        eofTag.style.fontWeight = 'bold';
        eofTag.style.fontSize = '10px';
        element.appendChild(eofTag);
    }
}

class InputBar {
    constructor(textareaId) {
        this.textarea = document.getElementById(textareaId);
        this.setupListeners();
    }

    setupListeners() {
        this.textarea.addEventListener('input', () => this.autoResize());
        this.textarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.altKey) {
                e.preventDefault();
                this.send();
            }
        });
    }

    autoResize() {
        this.textarea.style.height = 'auto';
        this.textarea.style.height = this.textarea.scrollHeight + 'px';
    }

    send() {
        const val = this.textarea.value.trim();
        if (!val) {
            return;
        }
        
        chatBoxComp.appendMessage('user', val);
        vscode.postMessage({ type: 'userInput', value: val });
        
        this.textarea.value = '';
        this.autoResize();
    }

    setValue(val) {
        this.textarea.value = val;
        this.textarea.focus();
        this.autoResize();
    }
}

// --- Initialize Components ---

const chatBoxComp = new ChatBox('chat-box');
const inputBarComp = new InputBar('input');

let activeStream = null;
let mdBuf = "";

// --- Global Helpers ---

function linkFile() { 
    vscode.postMessage({ type: 'linkActiveFile' }); 
}

function saveClear() { 
    vscode.postMessage({ type: 'saveAndClear' }); 
}

function updateContent(element, markdown) {
    element.innerHTML = marked.parse(markdown);
}

// --- Event Listeners ---

document.addEventListener('click', e => {
    const pre = e.target.closest('pre');
    if (pre) {
        const code = pre.innerText.replace("CLICK TO INSERT", "").trim();
        vscode.postMessage({ type: 'insertCode', value: code });
    }
});

window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
        case 'streamStart':
            chatBoxComp.removeEof();
            activeStream = chatBoxComp.appendMessage('ai', '');
            mdBuf = "";
            break;
        case 'streamUpdate':
            if (activeStream) {
                if (msg.dataType === 'reasoning') {
                    activeStream.reasoning.style.display = 'block';
                    activeStream.reasoning.textContent += msg.value;
                } else {
                    mdBuf += msg.value;
                    updateContent(activeStream.content, mdBuf);
                }
                chatBoxComp.scrollToBottom();
            }
            break;
        case 'streamEnd':
            if (activeStream) {
                chatBoxComp.addEof(activeStream.content);
            }
            activeStream = null;
            mdBuf = "";
            break;
        case 'clearView':
            chatBoxComp.clear();
            break;
        case 'restoreHistory':
            chatBoxComp.reset();
            msg.value.forEach(m => {
                const role = m.role === 'assistant' ? 'ai' : 'user';
                const msgObj = chatBoxComp.appendMessage(role, m.content);
                if (role === 'ai') {
                    updateContent(msgObj.content, m.content || '');
                } else {
                    msgObj.content.textContent = m.content || '';
                }
            });
            chatBoxComp.scrollToBottom();
            break;
        case 'fillInput':
            inputBarComp.setValue(msg.value);
            break;
        case 'error':
            const errorDiv = document.createElement('div');
            errorDiv.style.color = "red";
            errorDiv.textContent = "[!] " + msg.value;
            chatBoxComp.element.appendChild(errorDiv);
            break;
    }
});

// Signal that webview is ready
vscode.postMessage({ type: 'webviewLoaded' });
