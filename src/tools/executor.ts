import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { Logger } from '../utils/logger';

/**
 * ToolExecutor: 核心工具执行逻辑
 * 封装了所有 AI 可以调用的原子操作
 */
export class ToolExecutor {
    private static getRootPath(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        return folders?.[0].uri.fsPath;
    }

    /**
     * 规范化并验证路径是否在工作区内。
     */
    private static getSafePath(relativePath: string): string | undefined {
        const rootPath = this.getRootPath();
        if (!rootPath) return undefined;
        const absolutePath = path.normalize(path.join(rootPath, relativePath));
        if (!absolutePath.startsWith(rootPath)) return undefined;
        return absolutePath;
    }

    /**
     * 运行终端命令 (流式重构版 - Phase 7 - 修复版)
     * @param args { command: string }
     * @param onOutput 流式输出回调
     */
    static async run_command(args: { command: string }, onOutput?: (chunk: string) => void): Promise<string> {
        const rootPath = this.getRootPath();
        if (!rootPath) return "[❌] Error: No workspace folder opened.";

        // [安全校验]
        const dangerousCommands = ['rm -rf /', 'sudo ', ':(){ :|:& };:'];
        if (dangerousCommands.some(cmd => args.command.includes(cmd))) {
            return `[❌] SECURITY ALERT: Command "${args.command}" is prohibited.`;
        }

        // [模态确认]
        const confirm = await vscode.window.showWarningMessage(
            `[⚠️] AI 请求运行命令: \`${args.command}\``,
            { modal: true },
            '确认执行 (RUN)', '拒绝 (DENY)'
        );

        if (confirm !== '确认执行 (RUN)') {
            return "[❌] 操作被用户拒绝。";
        }

        return new Promise((resolve) => {
            // [修复] 简化 Spawn 调用，移除显式 Shell 嵌套
            // Node.js 的 { shell: true } 会自动处理跨平台兼容性
            const env = Object.assign({}, process.env, { OPENGRAVITY: "1" });

            const child = cp.spawn(args.command, {
                cwd: rootPath,
                env: env,
                shell: true
            });

            let stdoutBuf = "";
            let stderrBuf = "";

            child.stdout.on('data', (data) => {
                const chunk = data.toString();
                stdoutBuf += chunk;
                if (onOutput) onOutput(chunk);
            });

            child.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderrBuf += chunk;
                if (onOutput) onOutput(chunk);
            });

            // 监听 close 而非 exit，确保 stdio 流已关闭
            child.on('close', (code) => {
                const isSuccess = code === 0;
                const status = isSuccess ? "SUCCESS" : `FAILED (Exit Code: ${code})`;
                const combinedOutput = stdoutBuf + stderrBuf;
                
                const resultSummary = `\n[COMMAND EXECUTION REPORT]\n- Command: ${args.command}\n- Status: ${status}\n- Output Length: ${combinedOutput.length} chars\n---\n${combinedOutput || "(No visible output captured)"}\n---`.trim();
                resolve(resultSummary);
            });

            child.on('error', (err) => {
                resolve(`[❌] Spawning Error: ${err.message}`);
            });
        });
    }

    static async read_file(args: { path: string }): Promise<string> {
        const fullPath = this.getSafePath(args.path);
        if (!fullPath) return `[❌] 错误: 无效或越界的路径。`;

        try {
            return await fs.readFile(fullPath, 'utf-8');
        } catch (e: any) {
            Logger.error(`Error reading file: ${e.message}`, e);
            return `[❌] 读取文件时发生错误: ${e.message}`;
        }
    }

    static async write_file(args: { path: string, content: string }): Promise<string> {
        const fullPath = this.getSafePath(args.path);
        if (!fullPath) return `[❌] 错误: 无效或越界的路径。`;

        try {
            const dir = path.dirname(fullPath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(fullPath, args.content, 'utf-8');
            return "[✅] 文件已成功写入。";
        } catch (e: any) {
            Logger.error(`Error writing file: ${e.message}`, e);
            return `[❌] 写入文件时发生错误: ${e.message}`;
        }
    }

    static async replace(args: { path: string, old_string: string, new_string: string, instruction: string }): Promise<string> {
        const fullPath = this.getSafePath(args.path);
        if (!fullPath) return `[❌] 错误: 无效或越界的路径。`;

        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const firstIndex = content.indexOf(args.old_string);
            if (firstIndex === -1) return `[❌] 错误：在文件中未找到指定的旧代码片段。`;
            if (content.lastIndexOf(args.old_string) !== firstIndex) return `[❌] 错误：找到了多个相同的代码片段。`;

            const newContent = content.slice(0, firstIndex) + args.new_string + content.slice(firstIndex + args.old_string.length);
            await vscode.commands.executeCommand('opengravity.showDiff', { originalUri: vscode.Uri.file(fullPath), newContent });
            return `[✨] 已开启差异对比视图。请 Review 后点击“采纳”应用修改。`;
        } catch (e: any) {
            return `[❌] 触发修改失败: ${e.message}`;
        }
    }
}
