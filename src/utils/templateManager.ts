import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

export class TemplateManager {
    private static getSafePath(basePath: string, targetSegment: string): string {
        const fullPath = path.resolve(basePath, targetSegment);
        // Ensure the resolved path is still within the basePath
        // This prevents '..' from escaping the intended directory
        if (!fullPath.startsWith(basePath + path.sep) && basePath !== fullPath) {
            throw new Error(`Path traversal attempt detected: '${targetSegment}' resolved outside of base path '${basePath}'`);
        }
        return fullPath;
    }

    static async getSystemPrompt(extensionUri: vscode.Uri): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const workspaceBasePath = workspaceFolder.uri.fsPath;
            const userPromptRelativePath = path.join('.opengravity', 'SYSTEM.md');
            const userPath = TemplateManager.getSafePath(workspaceBasePath, userPromptRelativePath);
            try {
                await fs.promises.access(userPath); // Check existence asynchronously
                return await fs.promises.readFile(userPath, 'utf8'); // Read asynchronously
            } catch (e: any) {
                // If user file doesn't exist, fall through to defaultPath
                if (e.code !== 'ENOENT') {
                    Logger.error(`[OPGV] Error accessing user system prompt at '${userPath}': ${e.message}`);
                }
            }
        }
        const extensionBasePath = extensionUri.fsPath;
        const defaultPromptRelativePath = path.join('assets', 'templates', 'SYSTEM.md');
        const defaultPath = TemplateManager.getSafePath(extensionBasePath, defaultPromptRelativePath);
        return await fs.promises.readFile(defaultPath, 'utf8'); // Read asynchronously
    }

    static async initWorkspace(extensionUri: vscode.Uri) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }
        const workspaceBasePath = workspaceFolder.uri.fsPath;
        const configDirRelativePath = '.opengravity';
        const configDir = TemplateManager.getSafePath(workspaceBasePath, configDirRelativePath);
        
        const userPromptRelativePath = path.join(configDirRelativePath, 'SYSTEM.md');
        const userPromptPath = TemplateManager.getSafePath(workspaceBasePath, userPromptRelativePath);

        // Check if configDir exists asynchronously
        try {
            await fs.promises.access(configDir);
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                Logger.error(`[OPGV] Config directory not found at '${configDir}'. Creating...`);
                await fs.promises.mkdir(configDir, { recursive: true }); // Create asynchronously
                Logger.info(`[OPGV] Created config directory at '${configDir}'`);
            } else {
                Logger.error(`[OPGV] Error accessing config directory at '${configDir}': ${e.message}`);
                return; // Abort if other access error
            }
        }
        
        // Check if userPromptPath exists asynchronously
        try {
            await fs.promises.access(userPromptPath);
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                Logger.error(`[OPGV] User system prompt not found at '${userPromptPath}'. Creating...`);
                const content = await this.getSystemPrompt(extensionUri);
                await fs.promises.writeFile(userPromptPath, content, 'utf8'); // Write asynchronously
                Logger.info(`[OPGV] Created user system prompt at '${userPromptPath}'`);
            } else {
                Logger.error(`[OPGV] Error accessing user system prompt path at '${userPromptPath}': ${e.message}`);
            }
        }
    }
}