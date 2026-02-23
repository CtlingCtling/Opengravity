import { ToolExecutor } from '../../tools/executor';
import * as vscode from 'vscode';
import { promises as fs } from 'fs';

// 使用 Jest 模拟外部依赖
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showTextDocument: jest.fn()
    },
    workspace: {
        getConfiguration: jest.fn(),
        workspaceFolders: undefined as any,
        openTextDocument: jest.fn()
    },
    Uri: {
        parse: jest.fn((val: string) => ({ fsPath: val, toString: () => val })),
        file: jest.fn((path: string) => ({ fsPath: path, toString: () => `file://${path}` }))
    }
}), { virtual: true });

jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        mkdir: jest.fn()
    }
}));

describe('ToolExecutor 安全性测试', () => {
    const mockRoot = '/mock/project';

    beforeEach(() => {
        jest.clearAllMocks();
        // 设置模拟的工作区路径
        (vscode.workspace as any).workspaceFolders = [{
            uri: { fsPath: mockRoot },
            name: 'mock-project',
            index: 0
        }];
    });

    describe('read_file 安全检查', () => {
        it('应该允许读取工作区内的合法路径', async () => {
            const safePath = 'src/main.ts';
            const mockContent = 'hello opengravity';
            
            // 模拟用户点击 ACPT
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('ACPT');
            // 模拟文件读取成功
            (fs.readFile as jest.Mock).mockResolvedValue(mockContent);

            const result = await ToolExecutor.read_file({ path: safePath });

            expect(result).toBe(mockContent);
            expect(fs.readFile).toHaveBeenCalled();
        });

        it('应该拦截并拒绝路径遍历攻击 (../)', async () => {
            const maliciousPath = '../../etc/passwd';
            
            const result = await ToolExecutor.read_file({ path: maliciousPath });

            expect(result).toContain('错误: 无效或越界的路径');
            expect(fs.readFile).not.toHaveBeenCalled();
        });

        it('当用户拒绝 (RJCT) 时，不应执行读取操作', async () => {
            const safePath = 'src/main.ts';
            
            // 模拟用户点击 RJCT
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('RJCT');

            const result = await ToolExecutor.read_file({ path: safePath });

            expect(result).toContain('操作被用户拒绝');
            expect(fs.readFile).not.toHaveBeenCalled();
        });
    });

    describe('write_file 安全检查', () => {
        it('应该拦截尝试在工作区外写入文件的行为', async () => {
            const maliciousPath = '../outside.txt';
            
            const result = await ToolExecutor.write_file({ path: maliciousPath, content: 'hack' });

            expect(result).toContain('错误: 无效或越界的路径');
            expect(fs.writeFile).not.toHaveBeenCalled();
        });
    });
});
