import { ToolExecutor } from '../../tools/executor';
import * as vscode from 'vscode';
import * as cp from 'child_process';
import { EventEmitter } from 'events';

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/root' } }]
    },
    window: {
        showWarningMessage: jest.fn()
    },
    Uri: {
        file: jest.fn(path => ({ fsPath: path })),
    },
    commands: {
        executeCommand: jest.fn()
    }
}), { virtual: true });

// Mock child_process
jest.mock('child_process');

describe('Phase 7: 命令行执行系统深度验证', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('应该拦截危险命令', async () => {
        const result = await ToolExecutor.run_command({ command: 'rm -rf /' });
        expect(result).toContain('SECURITY ALERT');
        expect(cp.spawn).not.toHaveBeenCalled();
    });

    it('当用户拒绝确认时，不应执行命令', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('拒绝 (DENY)');
        
        const result = await ToolExecutor.run_command({ command: 'ls' });
        
        expect(result).toContain('操作被用户拒绝');
        expect(cp.spawn).not.toHaveBeenCalled();
    });

    it('应该支持流式输出并注入环境变量', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('确认执行 (RUN)');
        
        // 模拟子进程
        const mockChild: any = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        (cp.spawn as jest.Mock).mockReturnValue(mockChild);

        const chunks: string[] = [];
        const onOutput = (chunk: string) => chunks.push(chunk);

        // 启动执行 (不 await，因为我们需要在运行中发射事件)
        const execPromise = ToolExecutor.run_command({ command: 'echo hello' }, onOutput);

        // [关键] 给异步逻辑一点时间跨过第一个 await (showWarningMessage)
        await new Promise(resolve => setImmediate(resolve));

        // 验证环境变量注入
        expect(cp.spawn).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Array),
            expect.objectContaining({
                env: expect.objectContaining({ OPENGRAVITY: "1" }),
                cwd: '/mock/root'
            })
        );

        // 模拟流式数据到达
        mockChild.stdout.emit('data', Buffer.from('hello'));
        mockChild.stdout.emit('data', Buffer.from(' world'));
        
        // 模拟进程结束
        mockChild.emit('close', 0);

        const finalResult = await execPromise;

        expect(chunks).toEqual(['hello', ' world']);
        expect(finalResult).toContain('Success');
        expect(finalResult).toContain('hello world');
    });

    it('应该能捕捉到子进程产生的错误 (stderr)', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('确认执行 (RUN)');
        
        const mockChild: any = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        (cp.spawn as jest.Mock).mockReturnValue(mockChild);

        const execPromise = ToolExecutor.run_command({ command: 'invalid_cmd' });

        await new Promise(resolve => setImmediate(resolve));

        mockChild.stderr.emit('data', Buffer.from('command not found'));
        mockChild.emit('close', 127);

        const result = await execPromise;
        expect(result).toContain('Failed (Exit Code: 127)');
        expect(result).toContain('command not found');
    });
});
