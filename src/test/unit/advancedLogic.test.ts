import { SkillLoader } from '../../commands/utils/SkillLoader';
import { CommandRegistry } from '../../commands/Registry';
import { ToolExecutor } from '../../tools/executor';
import * as vscode from 'vscode';
import * as fs from 'fs';

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/root' } }],
        fs: {
            writeFile: jest.fn().mockResolvedValue(undefined)
        }
    },
    Uri: {
        file: jest.fn(path => ({ fsPath: path, scheme: 'file', path, with: jest.fn() })),
        parse: jest.fn(val => ({ toString: () => val }))
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
    }
}));

describe('Phase 5.1 & 6 深度稳定性验证', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('SkillLoader (提示词合成引擎)', () => {
        it('应该支持 {{args}} 简单替换', async () => {
            const template = "Run test on {{args}}";
            const result = await SkillLoader.synthesize(template, ['src/main.ts']);
            expect(result).toBe("Run test on src/main.ts");
        });

        it('应该能递归展开 @{path} 引用', async () => {
            (fs.promises.readFile as jest.Mock)
                .mockResolvedValueOnce("Sub-content with @{.gemini/c.md}")
                .mockResolvedValueOnce("Final Content");

            const template = "Start: @{.gemini/b.md}";
            const result = await SkillLoader.synthesize(template, []);
            
            expect(result).toContain("Final Content");
            expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
        });

        it('应该能拦截循环引用防止死循环', async () => {
            (fs.promises.readFile as jest.Mock).mockResolvedValue("Recursive: @{.gemini/self.md}");
            
            const template = "@{.gemini/self.md}";
            const result = await SkillLoader.synthesize(template, []);
            
            expect(result).toContain("[Circular Ref");
        });
    });

    describe('CommandRegistry (命名空间扫描)', () => {
        it('应该将子目录下的 TOML 映射为冒号分隔的命名空间', async () => {
            const registry = new CommandRegistry();
            
            // 模拟递归 readdir：根目录下有一个目录 'git'
            (fs.promises.readdir as jest.Mock).mockImplementation((dir: string) => {
                if (dir === '/mock/root/.opengravity/commands') {
                    return Promise.resolve([
                        { name: 'git', isDirectory: () => true }
                    ]);
                }
                if (dir.includes('git')) {
                    return Promise.resolve([
                        { name: 'review.toml', isDirectory: () => false }
                    ]);
                }
                return Promise.resolve([]);
            });

            (fs.promises.readFile as jest.Mock).mockResolvedValue('prompt = "test"');

            await registry.loadCustomCommands();
            
            // 验证是否通过 git/review.toml 注册了 git:review
            expect(registry.getCommand('git:review')).toBeDefined();
        });
    });

    describe('ToolExecutor.replace (精准修改)', () => {
        it('当匹配不唯一时应该拒绝修改', async () => {
            const content = "duplicated line\nduplicated line";
            (fs.promises.readFile as jest.Mock).mockResolvedValue(content);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('确认执行');

            const result = await ToolExecutor.replace({
                path: 'test.ts',
                old_string: 'duplicated line',
                new_string: 'new line',
                instruction: 'fix duplicate'
            });

            expect(result).toContain('找到了多个相同的代码片段');
        });

        it('匹配唯一时应该触发 showDiff 命令', async () => {
            const content = "target line\nother line";
            (fs.promises.readFile as jest.Mock).mockResolvedValue(content);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('确认执行');

            await ToolExecutor.replace({
                path: 'test.ts',
                old_string: 'target line',
                new_string: 'updated line',
                instruction: 'fix target'
            });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('opengravity.showDiff', expect.any(Object));
        });
    });
});
