/**
 * ## promptLoader.ts - 系统提示词加载/没有提示词默认
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * ## loadSystemPrompt
 * 
 */

export async function loadSystemPrompt(): Promise<string> {
    const defaultPrompt = `# SYSTEM PROMPT: Opengravity\nYou are Opengravity.An AI assistant integrated in VSCode, you can only respond in Chinese. You can only use tools when necessary. If you could work without using tools, you mustn's use tools.`;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = path.join(workspaceFolders[0].uri.fsPath, '.opengravity', 'SYSTEM.md');
        try {
            const content = fs.readFileSync(workspacePath, 'utf-8');
            return content.toString();
        } catch {
            return defaultPrompt;
        }
    }
    return defaultPrompt;
}