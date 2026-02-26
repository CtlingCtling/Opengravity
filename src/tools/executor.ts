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
     * [安全修复] 使用 path.relative 彻底杜绝路径穿越漏洞。
     */
    private static getSafePath(relativePath: string): string {
        const rootPath = this.getRootPath();
        if (!rootPath) {
            throw new Error("SECURITY ERROR: No workspace folder opened.");
        }

        const absolutePath = path.resolve(rootPath, relativePath);
        const relative = path.relative(rootPath, absolutePath);

        // 如果相对路径以 .. 开头，或者它是绝对路径（表示试图跨盘符或逃逸根目录）
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error(`SECURITY VIOLATION: Access denied to path outside workspace: ${absolutePath}`);
        }

        return absolutePath;
    }

    /**
     * 运行终端命令 (流式重构版 - Phase 7 - 修复版)
     * @param args { command: string }
     * @param onOutput 流式输出回调
     */
    static async run_command(args: { command: string }, onOutput?: (chunk: string) => void): Promise<string> {
        const rootPath = this.getRootPath();
        if (!rootPath) { return "[❌] Error: No workspace folder opened."; }

        // [安全加固] 扩展危险指令黑名单
        const dangerousPatterns = [
            'rm -rf /', 'sudo ', ':(){ :|:& };:', 
            '> /dev/sda', 'mkfs.', 'dd if=', 
            'curl http', 'wget http', // 简单防止下载执行
            'sh ', 'bash ', 'python -c', 'perl -e' // 防止二级脚本执行
        ];
        
        if (dangerousPatterns.some(p => args.command.includes(p))) {
            return `[❌] SECURITY ALERT: Command contains prohibited patterns.`;
        }

        // [意图检测] 检查是否包含命令拼接或重定向，增加警示权重
        const hasMetaChars = /[;&|>]/.test(args.command);
        const warningIcon = hasMetaChars ? "🔴 [CRITICAL WARNING]" : "⚠️ [ACTION REQUIRED]";
        const metaWarning = hasMetaChars ? "\n\n检测到命令拼接或重定向符号，请务必核实执行逻辑！" : "";

        // [模态确认] 强制要求人类审批
        const confirm = await vscode.window.showWarningMessage(
            `${warningIcon} AI 请求运行命令:\n\n\`${args.command}\`${metaWarning}`,
            { modal: true },
            '确认执行 (RUN)', '拒绝 (DENY)'
        );

        if (confirm !== '确认执行 (RUN)') {
            return "[❌] 操作被用户拒绝。";
        }

        return new Promise((resolve) => {
            const env = Object.assign({}, process.env, { OPENGRAVITY: "1" });

            const child = cp.spawn(args.command, {
                cwd: rootPath,
                env: env,
                shell: true // 保持 shell: true 以支持正常工程命令，但通过强力 UI 确认闭环
            });

            let stdoutBuf = "";
            let stderrBuf = "";

            child.stdout.on('data', (data) => {
                const chunk = data.toString();
                stdoutBuf += chunk;
                if (onOutput) { onOutput(chunk); }
            });

            child.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderrBuf += chunk;
                if (onOutput) { onOutput(chunk); }
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
        if (!fullPath) { return `[❌] 错误: 无效或越界的路径。`; }

        try {
            return await fs.readFile(fullPath, 'utf-8');
        } catch (e: any) {
            Logger.error(`Error reading file: ${e.message}`, e);
            return `[❌] 读取文件时发生错误: ${e.message}`;
        }
    }

    static async write_file(args: { path: string, content: string }): Promise<string> {
        const fullPath = this.getSafePath(args.path);
        if (!fullPath) { return `[❌] 错误: 无效或越界的路径。`; }

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
        if (!fullPath) { return `[❌] 错误: 无效或越界的路径。`; }

        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const firstIndex = content.indexOf(args.old_string);
            if (firstIndex === -1) { return `[❌] 错误：在文件中未找到指定的旧代码片段。`; }
            if (content.lastIndexOf(args.old_string) !== firstIndex) { return `[❌] 错误：找到了多个相同的代码片段。`; }

            const newContent = content.slice(0, firstIndex) + args.new_string + content.slice(firstIndex + args.old_string.length);
            await vscode.commands.executeCommand('opengravity.showDiff', { originalUri: vscode.Uri.file(fullPath), newContent });
            return `[✨] 已开启差异对比视图。请 Review 后点击“采纳”应用修改。`;
        } catch (e: any) {
            return `[❌] 触发修改失败: ${e.message}`;
        }
    }
}
