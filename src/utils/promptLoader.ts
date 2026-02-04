import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs'; // 👈 增加 fs 引入

export async function loadSystemPrompt(): Promise<string> {
    const defaultPrompt = `# SYSTEM PROMPT: Opengravity\nYou are Opengravity.`;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = path.join(workspaceFolders[0].uri.fsPath, '.opengravity', 'SYSTEM.md');
        try {
            // 使用同步读取，确保文件内容被立刻返回
            const content = fs.readFileSync(workspacePath, 'utf-8');
            return content.toString();
        } catch {
            // 找不到工作区文件，则返回默认 Prompt
            return defaultPrompt;
        }
    }
    
    // 如果没有打开工作区，也返回默认 Prompt
    return defaultPrompt;
}