import { ChatCommand } from '../../commands/slash/chat';
import { CompressCommand } from '../../commands/slash/compress';
import { MemoryCommand } from '../../commands/slash/memory';
import { InitCommand } from '../../commands/slash/init';
import { McpCommand } from '../../commands/slash/mcp';
import { AtHandler } from '../../commands/at/AtHandler';
import { ShellHandler } from '../../commands/shell/ShellHandler';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        showWarningMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn()
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/root' } }],
        fs: {
            createDirectory: jest.fn().mockResolvedValue(undefined),
            writeFile: jest.fn().mockResolvedValue(undefined)
        }
    },
    Uri: {
        file: jest.fn(path => ({ fsPath: path, scheme: 'file' })),
        joinPath: jest.fn((uri, ...parts) => {
            const base = uri ? uri.fsPath : '/mock';
            return { fsPath: base + '/' + parts.join('/'), scheme: 'file' };
        })
    }
}), { virtual: true });

// Mock fs
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        stat: jest.fn(),
        access: jest.fn(),
        readdir: jest.fn()
    }
}));

// Mock child_process
jest.mock('child_process');

describe('Opengravity 指令系统全方位健壮性测试', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = {
            historyManager: {
                getHistory: jest.fn().mockReturnValue([{ role: 'user', content: 'msg1' }, { role: 'assistant', content: 'msg2' }, { role: 'user', content: 'msg3' }, { role: 'assistant', content: 'msg4' }]),
                loadHistory: jest.fn(),
                clearHistory: jest.fn(),
                addItem: jest.fn()
            },
            chatHistoryService: {
                saveCheckpoint: jest.fn().mockResolvedValue(true),
                loadCheckpoint: jest.fn(),
                listCheckpoints: jest.fn().mockResolvedValue([]),
                deleteCheckpoint: jest.fn().mockResolvedValue(true)
            },
            mcp: {
                getServerNames: jest.fn().mockReturnValue(['server1']),
                reload: jest.fn().mockResolvedValue(undefined),
                getToolsForAI: jest.fn().mockResolvedValue([])
            },
            registry: {
                getAllCommands: jest.fn().mockReturnValue([{ name: 'test', description: 'test' }])
            },
            webview: { postMessage: jest.fn() },
            ai: { generateContentStream: jest.fn() },
            chatViewProvider: { refreshSystemPrompt: jest.fn() },
            extensionUri: { fsPath: '/mock/ext' },
            onInjectMessage: jest.fn()
        };
    });

    describe('1. 内置指令 (Slash Commands)', () => {
        it('Chat: share 应该成功导出并创建目录', async () => {
            const cmd = new ChatCommand();
            await cmd.execute(['share'], mockContext);
            expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
        });

        it('Init: 应该在确认后生成工作流目录', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('立即初始化');
            const cmd = new InitCommand();
            await cmd.execute([], mockContext);
            expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledTimes(10);
        });

        it('Mcp: refresh 应该触发重连', async () => {
            const cmd = new McpCommand();
            await cmd.execute(['refresh'], mockContext);
            expect(mockContext.mcp.reload).toHaveBeenCalled();
        });

        it('Compress: 成功摘要后应重置历史', async () => {
            mockContext.ai.generateContentStream.mockResolvedValue({ content: 'Summary text' });
            const cmd = new CompressCommand();
            await cmd.execute([], mockContext);
            expect(mockContext.historyManager.loadHistory).toHaveBeenCalled();
            expect(mockContext.webview.postMessage).toHaveBeenCalledWith({ type: 'clearView' });
        });
    });

    describe('2. 上下文注入 (AtHandler)', () => {
        it('应该识别并注入目录，使用正确的 REFERENCE 标记', async () => {
            (fs.promises.stat as jest.Mock).mockImplementation((path: string) => {
                if (path === '/mock/root/src' || path === '/mock/root/src/') {
                    return Promise.resolve({ isDirectory: () => true });
                }
                return Promise.resolve({ isDirectory: () => false });
            });

            const manyFiles = Array.from({ length: 25 }, (_, i) => `file${i}.ts`);
            (fs.promises.readdir as jest.Mock).mockResolvedValue(manyFiles);
            (fs.promises.readFile as jest.Mock).mockResolvedValue('content');

            await AtHandler.handle('src/', mockContext);

            // 验证注入的消息内容是否包含最新的 gemini-cli 风格标记
            expect(mockContext.onInjectMessage).toHaveBeenCalledWith(expect.stringContaining('REFERENCE_DIRECTORY_START: src/ (20 files)'));
        });
    });

    describe('3. 终端直通 (ShellHandler)', () => {
        it('命令执行成功后应将 STDOUT 同步给 AI', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('确认执行');
            (cp.exec as unknown as jest.Mock).mockImplementation((cmd, opts, callback) => {
                callback(null, 'Success Output', '');
            });

            await ShellHandler.handle('!ls', mockContext);
            expect(mockContext.onInjectMessage).toHaveBeenCalledWith(expect.stringContaining('Success Output'));
        });
    });
});
