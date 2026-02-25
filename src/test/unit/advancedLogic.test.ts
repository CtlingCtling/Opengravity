import { TemplateManager } from '../../utils/templateManager';
import { CommandRegistry } from '../../commands/Registry';
import { ToolExecutor } from '../../tools/executor';
import * as vscode from 'vscode';
import * as fs from 'fs';

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/root' } }],
        fs: {
            writeFile: jest.fn().mockResolvedValue(undefined),
            createDirectory: jest.fn().mockResolvedValue(undefined),
            stat: jest.fn()
        }
    },
    Uri: {
        file: jest.fn(path => ({ fsPath: path, scheme: 'file', path, with: jest.fn() })),
        parse: jest.fn(val => ({ toString: () => val })),
        joinPath: jest.fn((uri, ...parts) => ({ fsPath: uri.fsPath + '/' + parts.join('/'), path: uri.fsPath + '/' + parts.join('/'), scheme: 'file' }))
    },
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined)
    },
    window: {
        showWarningMessage: jest.fn(),
        showInformationMessage: jest.fn()
    }
}), { virtual: true });

// Mock fs
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
        readdir: jest.fn(),
        stat: jest.fn(),
        access: jest.fn(),
        mkdir: jest.fn()
    },
    existsSync: jest.fn()
}));

describe('Phase 5.1 & 6 深度稳定性验证 (重构版)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('TemplateManager (统一渲染引擎)', () => {
        it('应该支持 {{key}} 简单替换', async () => {
            const template = "Run test on {{target}}";
            const result = await TemplateManager.render(template, { target: 'src/main.ts' });
            expect(result).toBe("Run test on src/main.ts");
        });

        it('应该能递归展开 @{path} 引用', async () => {
            (fs.promises.readFile as jest.Mock)
                .mockResolvedValueOnce("Sub-content with @{.opengravity/c.md}")
                .mockResolvedValueOnce("Final Content");

            const template = "Start: @{.opengravity/b.md}";
            const result = await TemplateManager.render(template, {});
            
            expect(result).toContain("Final Content");
            expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
        });
    });

    describe('CommandRegistry (命名空间扫描)', () => {
        it('应该识别工作区下的 TOML 指令', async () => {
            const registry = new CommandRegistry({ fsPath: '/mock/ext' } as any);
            
            (fs.promises.readdir as jest.Mock).mockResolvedValue([
                { name: 'test.toml', isDirectory: () => false, isFile: () => true } as any
            ]);

            (fs.promises.readFile as jest.Mock).mockResolvedValue('name = "test"\nprompt = "test"');

            await registry.loadAllCommands();
            expect(registry.getCommand('test')).toBeDefined();
        });
    });

    describe('ToolExecutor.replace (精准修改)', () => {
        it('当匹配不唯一时应该拒绝修改', async () => {
            const content = "duplicated line\nduplicated line";
            (fs.promises.readFile as jest.Mock).mockResolvedValue(content);

            const result = await ToolExecutor.replace({
                path: 'test.ts',
                old_string: 'duplicated line',
                new_string: 'new line',
                instruction: 'fix duplicate'
            });

            expect(result).toContain('找到了多个相同的代码片段');
        });

        it('匹配唯一时应该触发 showDiff 逻辑', async () => {
            const content = "unique line\nother line";
            (fs.promises.readFile as jest.Mock).mockResolvedValue(content);

            await ToolExecutor.replace({
                path: 'test.ts',
                old_string: 'unique line',
                new_string: 'updated line',
                instruction: 'fix unique'
            });

            // 验证核心交互逻辑：触发差异对比视图
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('opengravity.showDiff', expect.any(Object));
        });
    });
});
