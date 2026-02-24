import { CommandDispatcher } from '../../commands/CommandDispatcher';
import { AtHandler } from '../../commands/at/AtHandler';
import { ShellHandler } from '../../commands/shell/ShellHandler';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';

// 模拟所有外部依赖
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/project' } }]
    },
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn() })),
        createTerminal: jest.fn(() => ({ show: jest.fn(), sendText: jest.fn() })),
        activeTerminal: undefined
    },
    Uri: {
        parse: jest.fn(val => ({ fsPath: val, toString: () => val })),
        file: jest.fn(val => ({ fsPath: val, toString: () => val }))
    }
}), { virtual: true });

// 全面模拟 fs 模块
jest.mock('fs', () => {
    return {
        existsSync: jest.fn().mockReturnValue(true),
        promises: {
            stat: jest.fn(),
            readdir: jest.fn().mockResolvedValue([]),
            readFile: jest.fn(),
            access: jest.fn().mockResolvedValue(undefined),
            mkdir: jest.fn().mockResolvedValue(undefined)
        }
    };
});

jest.mock('child_process');

describe('指令系统集成测试', () => {
    let dispatcher: CommandDispatcher;
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        dispatcher = new CommandDispatcher();
        mockContext = {
            onInjectMessage: jest.fn(),
            webview: { postMessage: jest.fn() }
        };
    });

    describe('CommandDispatcher 路由分发', () => {
        it('应该识别并分发 Slash 指令 (/)', async () => {
            const result = await dispatcher.dispatch('/help', {} as any, {} as any, { postMessage: jest.fn() } as any, {} as any, jest.fn(), {} as any, {} as any, {} as any);
            expect(result).not.toBeNull();
            expect(result?.status).toBeDefined();
        });

        it('应该识别并分发 At 指令 (@)', async () => {
            // Mock AtHandler.handle
            (fs.promises.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false });
            (fs.promises.readFile as jest.Mock).mockResolvedValue('content');

            const spy = jest.spyOn(AtHandler, 'handle');
            await dispatcher.dispatch('@file.ts', {} as any, {} as any, {} as any, {} as any, jest.fn(), {} as any, {} as any, {} as any);
            expect(spy).toHaveBeenCalled();
        });

        it('应该识别并分发 Shell 指令 (!)', async () => {
            const spy = jest.spyOn(ShellHandler, 'handle');
            // 模拟用户取消以快速结束
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('取消');
            await dispatcher.dispatch('!ls', {} as any, {} as any, {} as any, {} as any, jest.fn(), {} as any, {} as any, {} as any);
            expect(spy).toHaveBeenCalled();
        });
    });

    describe('AtHandler 上下文注入', () => {
        it('应该拦截并拒绝工作区外的路径', async () => {
            // 注意：现在 Handler 接收的是经 Dispatcher 正则解析后的纯路径，不带 @
            const result = await AtHandler.handle('../../etc/passwd', mockContext);
            expect(result?.status).toBe('error');
            expect(result?.message).toContain('禁止访问');
        });

        it('应该能正确处理单一文件读取', async () => {
            (fs.promises.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false });
            (fs.promises.readFile as jest.Mock).mockResolvedValue('file content');

            const result = await AtHandler.handle('src/main.ts', mockContext);
            
            expect(result?.status).toBe('success');
            expect(mockContext.onInjectMessage).toHaveBeenCalledWith(expect.stringContaining('file content'));
        });
    });

    describe('ShellHandler 终端桥接', () => {
        it('当用户拒绝确认时，不应执行命令', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('取消');

            const result = await ShellHandler.handle('!npm test', mockContext);
            
            expect(cp.exec).not.toHaveBeenCalled();
            expect(result?.status).toBe('intercepted');
        });

        it('当用户确认后，应该执行命令并注入结果', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('确认执行');
            (cp.exec as unknown as jest.Mock).mockImplementation((cmd, opts, callback) => {
                callback(null, 'test success', '');
            });

            await ShellHandler.handle('!npm test', mockContext);

            expect(cp.exec).toHaveBeenCalledWith('npm test', expect.any(Object), expect.any(Function));
            expect(mockContext.onInjectMessage).toHaveBeenCalledWith(expect.stringContaining('test success'));
        });
    });
});
