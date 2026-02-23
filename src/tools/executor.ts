/**
 * ## executor.ts - Opengravity 工具 (审查后修改建议)
 * #SENIOR_ENGINEER_NOTE:
 * - [安全加固] 禁用了存在严重安全风险的 `run_command` 函数。直接执行来自AI的命令是极其危险的。
 * - [性能改进] 将所有同步文件I/O替换为异步版本，以防阻塞UI线程。
 * - [路径安全] 在读写文件前，通过 `path.normalize` 和 `startsWith` 检查来防止路径遍历攻击 (Path Traversal)。确保所有文件操作都限制在项目工作区内。
 * - [明确职责] 提供了更安全的命令执行替代方案的建议，即将通用 `run_command` 替换为更具体的、封装好的函数 (例如 `compile_c_file`, `list_directory`)。
 */
import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export class ToolExecutor {
    private static getRootPath(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        return folders?.[0].uri.fsPath;
    }

    /**
     * 规范化并验证路径是否在工作区内。
     * @param relativePath - 用户或AI提供的相对路径。
     * @returns 返回一个安全的、绝对的路径，如果路径无效或越界则返回 undefined。
     */
    private static getSafePath(relativePath: string): string | undefined {
        const rootPath = this.getRootPath();
        if (!rootPath) {
            return undefined;
        }

        // 规范化路径，解析 '..' 等
        const absolutePath = path.normalize(path.join(rootPath, relativePath));

        // [安全检查] 确保规范化后的路径仍然在工作区根目录之内。
        // 这是防止路径遍历攻击的关键。
        if (!absolutePath.startsWith(rootPath)) {
            return undefined;
        }
        return absolutePath;
    }

    static async read_file(args: { path: string }): Promise<string> {
        const fullPath = this.getSafePath(args.path);
        if (!fullPath) {
            return `[❌] 错误: 无效或越界的路径 | Error: Invalid or out-of-bounds path.`;
        }

        const confirm = await vscode.window.showInformationMessage(
            `[📖] Opengravity 请求读取: ${args.path} | OPGV wants to read.`, 'ACPT', 'RJCT'
        );
        if (confirm !== 'ACPT') {
            return "[❌] 操作被用户拒绝 | User denied read access.";
        }

        try {
            // 使用异步API
            return await fs.readFile(fullPath, 'utf-8');
        } catch (e: any) {
            Logger.error(`Error reading file: ${e.message}`, e); // Log the error with Logger
            if (e.code === 'ENOENT') {
                return "[❌] 没有找到文件 | File not found.";
            }
            return `[❌] 读取文件时发生错误 | Error reading file: ${e.message}`;
        }
    }

    static async write_file(args: { path: string, content: string }): Promise<string> {
        const fullPath = this.getSafePath(args.path);
        if (!fullPath) {
            return `[❌] 错误: 无效或越界的路径 | Error: Invalid or out-of-bounds path.`;
        }

        const confirm = await vscode.window.showWarningMessage(
            `[✍️] Opengravity 请求写入/修改: ${args.path}. | OPGV wants to write/modify.`,
            { modal: true },
            'ACPT'
        );

        if (confirm !== 'ACPT') {
            return "[❌] 操作被用户拒绝 | User denied write access.";
        }

        try {
            const dir = path.dirname(fullPath);
            // 异步地递归创建目录
            await fs.mkdir(dir, { recursive: true });
            // 异步写入文件
            await fs.writeFile(fullPath, args.content, 'utf-8');

            // 自动打开文件
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc);

            return "[✅] 文件已成功写入并打开 | File written and opened successfully.";
        } catch (e: any) {
            Logger.error(`Error writing file: ${e.message}`, e); // Log the error with Logger
            return `[❌] 写入文件时发生错误 | Error writing file: ${e.message}`;
        }
    }

    /**
     * [安全警告] 此函数已被禁用
     * 直接执行由AI生成的命令存在严重的安全风险。
     * 请考虑使用更具体的、封装好的工具来替代它。
     * 例如: `compile_c_file({path: 'main.c'})` 或 `list_directory({path: 'src/'})`
     */
    static async run_command(args: { command: string }): Promise<string> {
        vscode.window.showErrorMessage("出于安全考虑，`run_command` 工具已被禁用。请使用更具体的工具。");
        return "[❌] 安全错误: `run_command` 工具已被禁用。 | SECURITY ERROR: The `run_command` tool is disabled.";
    }
}
