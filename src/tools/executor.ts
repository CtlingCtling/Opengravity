/**
 * ## executor.ts - Opengravity 工具
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ## ToolExecutor Class
 * #EXPLAINATION:
 * - 提供 read_file, write_file, run_command 三个工具函数
 * - 每个函数在执行前都会请求确认
 */

export class ToolExecutor {
    private static getRootPath(): string {
        const folders = vscode.workspace.workspaceFolders;
        return folders ? folders[0].uri.fsPath : "";
    }

    static async read_file(args: { path: string }): Promise<string> {
        const fullPath = path.join(this.getRootPath(), args.path);

        const confirm = await vscode.window.showInformationMessage(
            `[📖]Opengravity 请求读取: ${args.path} | OPGV wants to read.`, 'ACPT', 'RJCT'
        );
        if (confirm !== 'ACPT') {
            return "[❌]: User denied read access.";
        }
        try {
            if (!fs.existsSync(fullPath)) {
                return "[❌] 没有找到文件 | File not found.";
            }
            return fs.readFileSync(fullPath, 'utf-8');
        } catch (e: any) {
            return `[❌]Error: ${e.message}`;
        }
    }

    static async write_file(args: { path: string, content: string }): Promise<string> {
        const fullPath = path.join(this.getRootPath(), args.path);

        const confirm = await vscode.window.showWarningMessage(
            `[✍️]Opengravity 请求写入/修改: ${args.path}. | OPGV wants to write.`, 'ACPT', 'RJCT'
        );
        if (confirm !== 'ACPT') {
            return "[❌] 拒绝写入 | User denied write access.";
        }
        try {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(fullPath, args.content, 'utf-8');
            
            // 自动打开文件
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc);
            
            return "[✅] 文件已写入 | File written and opened.";
        } catch (e: any) {
            return `[❌]Error: ${e.message}`;
        }
    }

    static async run_command(args: { command: string }): Promise<string> {
        const confirm = await vscode.window.showWarningMessage(
            `[🔔] Opengravity 请求运行命令: \n> ${args.command} | OPGV wants to run command`, 'ACPT', 'RJCT'
        );
        if (confirm !== 'ACPT') {
            return "[❌] 拒绝输入 | User blocked command execution.";
        }

        const terminal = vscode.window.activeTerminal || vscode.window.createTerminal("TARS Terminal");
        terminal.show();
        terminal.sendText(args.command);
        
        return "[✅] 命令已执行 | Command sent to terminal.";
    }
}