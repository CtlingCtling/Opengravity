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
     * 运行终端命令 (原子执行版)
     * 底层防线：即使通过了 UI 审批，这里依然拦截毁灭性指令。
     * 移除 UI 弹窗：审批已由 Provider 层通过 Inline 预览完成。
     */
    static async run_command(args: { command: string }, onOutput?: (chunk: string) => void): Promise<string> {
        const rootPath = this.getRootPath();
        if (!rootPath) return "[❌] Error: No workspace folder opened.";

        // [核心安全黑名单]
        const dangerousPatterns = [
            'rm -rf /', 'sudo ', ':(){ :|:& };:', 
            '> /dev/sda', 'mkfs.', 'dd if=', 
            'curl http', 'wget http', 'sh ', 'bash ', 'python -c'
        ];
        
        if (dangerousPatterns.some(p => args.command.includes(p))) {
            return `[❌] SECURITY ALERT: Command blocked by ToolExecutor (Lethal Pattern).`;
        }

        // [意图检测]
        if (/[;&|>]/.test(args.command)) {
            Logger.warn(`[OPGV] Risky characters detected in command: ${args.command}`);
        }

        return new Promise((resolve) => {
            const env = { ...process.env, OPENGRAVITY: "1" };
            const child = cp.spawn(args.command, {
                cwd: rootPath,
                env: env,
                shell: true 
            });

            let combined = "";
            child.stdout.on('data', (data) => {
                const chunk = data.toString();
                combined += chunk;
                if (onOutput) onOutput(chunk);
            });
            child.stderr.on('data', (data) => {
                const chunk = data.toString();
                combined += chunk;
                if (onOutput) onOutput(chunk);
            });

            child.on('close', (code) => {
                resolve(combined || `(Process exited with code ${code})`);
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

    /**
     * 精准替换 (原子执行版)
     */
    static async replace(args: { path: string, old_string: string, new_string: string, instruction: string }): Promise<string> {
        const fullPath = this.getSafePath(args.path);
        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const firstIndex = content.indexOf(args.old_string);
            
            if (firstIndex === -1) {
                return `[❌] Error: Exact match not found in ${args.path}.`;
            }
            if (content.lastIndexOf(args.old_string) !== firstIndex) {
                return `[❌] Error: Multiple matches found. Provide more context.`;
            }

            const newContent = content.slice(0, firstIndex) + args.new_string + content.slice(firstIndex + args.old_string.length);
            await fs.writeFile(fullPath, newContent, 'utf-8');
            return `Successfully applied changes to ${args.path}`;
        } catch (e: any) {
            return `[❌] Replace failed: ${e.message}`;
        }
    }
}
