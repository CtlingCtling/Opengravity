import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

export class TemplateManager {
    private static readonly REF_REGEX = /(?<!\\)@\{([^}]+)\}/g;

    /**
     * 加载模板：优先从工作区 .opengravity/ 加载，若无则从插件 assets/templates 加载
     */
    static async loadTemplate(extensionUri: vscode.Uri, templatePath: string): Promise<string> {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root) {
            const userTemplatePath = path.join(root, '.opengravity', templatePath);
            try {
                if (fs.existsSync(userTemplatePath)) {
                    return await fs.promises.readFile(userTemplatePath, 'utf8');
                }
            } catch (e) {}
        }

        // Fallback to internal assets
        const internalPath = path.join(extensionUri.fsPath, 'assets', 'templates', templatePath);
        return await fs.promises.readFile(internalPath, 'utf8');
    }

    /**
     * 加载插件内部原始模板 (用于部署拷贝)
     */
    static async loadInternalTemplate(extensionUri: vscode.Uri, templateName: string): Promise<string> {
        const internalPath = path.join(extensionUri.fsPath, 'assets', 'templates', templateName);
        return await fs.promises.readFile(internalPath, 'utf8');
    }

    /**
     * 核心渲染逻辑：变量替换 + 条件分支 + 递归文件引用 (@{path})
     */
    static async render(template: string, data: Record<string, any>): Promise<string> {
        let result = template;

        // 1. 处理 {{#if key}}...{{/if}}
        const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
        result = result.replace(ifRegex, (_, key, thenBranch, elseBranch) => {
            return data[key] ? thenBranch : (elseBranch || "");
        });

        // 2. 处理 {{key}} 变量
        const varRegex = /\{\{(\w+)\}\}/g;
        result = result.replace(varRegex, (_, key) => {
            return data[key] !== undefined ? String(data[key]) : `{{${key}}}`;
        });

        // 3. 处理递归文件引用 @{path}
        result = await this.resolveReferences(result, new Set<string>());

        return result;
    }

    private static async resolveReferences(content: string, visited: Set<string>): Promise<string> {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) return content;

        const matches = [...content.matchAll(this.REF_REGEX)];
        if (matches.length === 0) return content;

        let processed = content;
        for (const match of matches) {
            const [tag, relPath] = match;
            const absPath = path.normalize(path.join(rootPath, relPath));

            if (!absPath.startsWith(rootPath) || visited.has(absPath)) continue;

            try {
                visited.add(absPath);
                let fileContent = await fs.promises.readFile(absPath, 'utf-8');
                fileContent = await this.resolveReferences(fileContent, visited);
                processed = processed.replace(tag, fileContent);
            } catch (e) {
                processed = processed.replace(tag, `[Error: ${relPath}]`);
            }
        }
        return processed;
    }

    /**
     * 获取系统提示词：优先从工作区 .opengravity/SYSTEM.md 读取
     */
    static async getSystemPrompt(extensionUri: vscode.Uri): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const userPath = path.join(workspaceFolder.uri.fsPath, '.opengravity', 'SYSTEM.md');
            if (fs.existsSync(userPath)) return await fs.promises.readFile(userPath, 'utf8');
        }
        return this.loadInternalTemplate(extensionUri, 'SYSTEM.md');
    }

    /**
     * 启动时自检：确保 .opengravity 目录结构与资产对齐
     */
    static async ensureConfigDir(extensionUri: vscode.Uri) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const rootUri = workspaceFolder.uri;
        const configDirUri = vscode.Uri.joinPath(rootUri, '.opengravity');

        try {
            // 1. 确保基础子目录存在
            const baseDirs = ['skills', 'agents', 'codingstyle', 'commands', 'sessions', 'commands_prompt'];
            for (const dir of baseDirs) {
                await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(configDirUri, dir));
            }

            // 2. 将 assets/templates 内容镜像同步到 .opengravity/ 根部 (核心修正)
            await this.syncDir(
                path.join(extensionUri.fsPath, 'assets', 'templates'),
                configDirUri,
                "Config Assets"
            );

            // 3. 将 assets/commands (TOML) 同步到 .opengravity/commands/
            await this.syncDir(
                path.join(extensionUri.fsPath, 'assets', 'commands'),
                vscode.Uri.joinPath(configDirUri, 'commands'),
                "Instructions"
            );

        } catch (error: any) {
            Logger.error(`[OPGV] Failed to ensure config directory: ${error.message}`);
        }
    }

    /**
     * 通用的目录同步工具
     */
    private static async syncDir(srcDir: string, destUri: vscode.Uri, label: string) {
        const copyRecursive = async (src: string, dest: vscode.Uri) => {
            if (!fs.existsSync(src)) return;
            const entries = await fs.promises.readdir(src, { withFileTypes: true });
            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destFileUri = vscode.Uri.joinPath(dest, entry.name);

                if (entry.isDirectory()) {
                    await vscode.workspace.fs.createDirectory(destFileUri);
                    await copyRecursive(srcPath, destFileUri);
                } else {
                    // 如果文件已存在，仅在内容不同时覆盖（防止不必要的磁盘操作）
                    const content = await fs.promises.readFile(srcPath);
                    await vscode.workspace.fs.writeFile(destFileUri, content);
                }
            }
        };

        try {
            await copyRecursive(srcDir, destUri);
            Logger.info(`[OPGV] ${label} synchronized to .opengravity/`);
        } catch (e: any) {
            Logger.error(`[OPGV] Sync ${label} failed: ${e.message}`);
        }
    }
}
