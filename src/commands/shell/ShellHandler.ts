import * as vscode from 'vscode';
import * as cp from 'child_process';
import { CommandContext, CommandResult } from '../ICommand';
import { Logger } from '../../utils/logger';

/**
 * ShellHandler: 处理以 '!' 开头的终端直通指令
 */
export class ShellHandler {
    /**
     * 执行处理逻辑
     * @param text 用户输入的原始文本，如 "!npm test"
     */
    static async handle(text: string, context: CommandContext): Promise<CommandResult | null> {
        const command = text.slice(1).trim();
        if (!command) {
            return { status: 'error', message: '请输入要执行的命令，例如: !ls' };
        }

        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!rootPath) {
            return { status: 'error', message: '当前未打开任何工作区，无法确定执行目录' };
        }

        // 1. 安全确认
        const confirm = await vscode.window.showWarningMessage(
            `[⚠️] 确认执行终端命令?\n命令: ${command}`,
            { modal: true },
            '确认执行'
        );

        if (confirm !== '确认执行') {
            return { status: 'intercepted', message: '用户已取消执行' };
        }

        Logger.info(`[OPGV] Executing shell command: ${command}`);

        return new Promise((resolve) => {
            // 2. 执行命令
            cp.exec(command, { cwd: rootPath }, async (error, stdout, stderr) => {
                const exitCode = error ? error.code : 0;
                
                // 3. 构造注入消息，让 AI 感知结果
                // 正确转义内部反引号，并修复 join 逻辑
                const lines = [
                    "[TERMINAL OUTPUT]",
                    `Command: \`${command}\``,
                    `Exit Code: ${exitCode}`,
                    "",
                    "--- STDOUT ---",
                    stdout || "(empty)",
                    "",
                    "--- STDERR ---",
                    stderr || "(empty)",
                    "",
                    "请根据终端的执行结果（成功或报错）给出建议。"
                ];
                
                const resultMessage = lines.join('\n');

                // 4. 将结果注入对话流
                await context.onInjectMessage(resultMessage);

                if (error) {
                    resolve({ 
                        status: 'success', 
                        message: `命令执行完成 (Code: ${exitCode})，已同步给 AI。` 
                    });
                } else {
                    resolve({ 
                        status: 'success', 
                        message: '命令执行成功，结果已同步给 AI。' 
                    });
                }
            });
        });
    }
}
