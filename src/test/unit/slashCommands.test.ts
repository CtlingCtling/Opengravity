import { CommandRegistry } from '../../commands/Registry';
import { CompressCommand } from '../../commands/slash/compress';
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
    existsSync: jest.fn().mockReturnValue(true),
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        stat: jest.fn(),
        access: jest.fn(),
        readdir: jest.fn().mockResolvedValue([])
    }
}));

jest.mock('child_process');

describe('Opengravity 指令系统全方位健壮性测试 (解耦版)', () => {
    let mockContext: any;
    let registry: CommandRegistry;

    beforeEach(() => {
        jest.clearAllMocks();
        registry = new CommandRegistry({ fsPath: '/mock/ext' } as any);
        mockContext = {
            historyManager: {
                getHistory: jest.fn().mockReturnValue([{ role: 'user', content: 'msg1' }, { role: 'assistant', content: 'msg2' }]),
                loadHistory: jest.fn(),
                clearHistory: jest.fn(),
                addItem: jest.fn()
            },
            chatHistoryService: {
                saveCheckpoint: jest.fn().mockResolvedValue(true),
                loadCheckpoint: jest.fn()
            },
            mcp: { reload: jest.fn() },
            registry: registry,
            webview: { postMessage: jest.fn() },
            ai: { generateContentStream: jest.fn() },
            extensionUri: { fsPath: '/mock/ext' },
            onInjectMessage: jest.fn()
        };
    });

    describe('1. 核心内核指令 (Kernel Commands)', () => {
        it('Compress: 摘要后应成功替换历史', async () => {
            mockContext.ai.generateContentStream.mockResolvedValue({ content: 'Summary text' });
            const cmd = new CompressCommand();
            await cmd.execute([], mockContext);
            expect(mockContext.historyManager.loadHistory).toHaveBeenCalled();
        });

        it('Init: 应该在确认后执行 FS 操作', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('立即初始化');
            const cmd = new InitCommand();
            await cmd.execute([], mockContext);
            expect(vscode.workspace.fs.createDirectory).toHaveBeenCalled();
        });
    });

    describe('2. 上下文协议处理', () => {
        it('AtHandler 应拒绝越界路径', async () => {
            const result = await AtHandler.handle('../sensitive', mockContext);
            expect(result?.status).toBe('error');
        });
    });
});
