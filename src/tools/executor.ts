/**
 * executor.ts
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ToolExecutor {
    private static getRootPath(): string {
        const folders = vscode.workspace.workspaceFolders;
        return folders ? folders[0].uri.fsPath : "";
    }

    /**
     * 读取文件逻辑
     */
    static async read_file(args: { path: string }): Promise<string> {
        const fullPath = path.join(this.getRootPath(), args.path);
        
        // 1. 权限请求
        const confirm = await vscode.window.showInformationMessage(
            `[📖]Opengravity 请求读取: ${args.path} | OPGV wants to read.`, 'ACPT', 'RJCT'
        );
        if (confirm !== 'ACPT') {
            return "[❌]: User denied read access.";
        }
        // 2. 执行读取
        try {
            if (!fs.existsSync(fullPath)) {
                return "[❌] 没有找到文件 | File not found.";
            }
            return fs.readFileSync(fullPath, 'utf-8');
        } catch (e: any) {
            return `[❌]Error: ${e.message}`;
        }
    }

    /**
     * 写入文件逻辑
     */
    static async write_file(args: { path: string, content: string }): Promise<string> {
        const fullPath = path.join(this.getRootPath(), args.path);

        // 1. 权限请求 (警告级别)
        const confirm = await vscode.window.showWarningMessage(
            `[✍️]Opengravity 请求写入/修改: ${args.path}. | OPGV wants to write.`, 'ACPT', 'RJCT'
        );
        if (confirm !== 'ACPT') {
            return "[❌] 拒绝写入 | User denied write access.";
        }
        // 2. 执行写入
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

    /**
     * 执行命令逻辑
     */
    static async run_command(args: { command: string }): Promise<string> {
        // 1. 权限请求
        const confirm = await vscode.window.showWarningMessage(
            `[🔔] Opengravity 请求运行命令: \n> ${args.command} | OPGV wants to run command`, 'ACPT', 'RJCT'
        );
        if (confirm !== 'ACPT') {
            return "[❌] 拒绝输入 | User blocked command execution.";
        }

        // 2. 在终端执行
        const terminal = vscode.window.activeTerminal || vscode.window.createTerminal("TARS Terminal");
        terminal.show();
        terminal.sendText(args.command);
        
        return "[✅] 命令已执行 | Command sent to terminal.";
    }
}