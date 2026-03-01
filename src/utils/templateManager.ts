import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './logger';

export class TemplateManager {
    private static readonly REF_REGEX = /(?<!\\)@\{([^}]+)\}/g;
    private static readonly MAX_RECURSION_DEPTH = 10; // [修复] 限制递归深度，防止递归炸弹

    /**
     * 加载模板：优先从工作区 .opengravity/ 加载，若无则从插件 assets/templates 加载
     */
    static async loadTemplate(extensionUri: vscode.Uri, templatePath: string): Promise<string> {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (root) {
            const userTemplateUri = vscode.Uri.joinPath(root, '.opengravity', templatePath);
            try {
                const content = await vscode.workspace.fs.readFile(userTemplateUri);
                return new TextDecoder().decode(content);
            } catch (e) {
                // 文件不存在，继续回退
            }
        }

        // Fallback to internal assets
        const internalUri = vscode.Uri.joinPath(extensionUri, 'assets', 'templates', templatePath);
        const internalContent = await vscode.workspace.fs.readFile(internalUri);
        return new TextDecoder().decode(internalContent);
    }

    /**
     * 加载插件内部原始模板 (用于部署拷贝)
     */
    static async loadInternalTemplate(extensionUri: vscode.Uri, templateName: string): Promise<string> {
        const internalUri = vscode.Uri.joinPath(extensionUri, 'assets', 'templates', templateName);
        const content = await vscode.workspace.fs.readFile(internalUri);
        return new TextDecoder().decode(content);
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
        result = await this.resolveReferences(result, new Set<string>(), 0);

        return result;
    }

    private static async resolveReferences(content: string, visited: Set<string>, depth: number): Promise<string> {
        if (depth > this.MAX_RECURSION_DEPTH) {
            return "[Error: Maximum recursion depth exceeded]";
        }

        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) { return content; }

        const matches = [...content.matchAll(this.REF_REGEX)];
        if (matches.length === 0) { return content; }

        let processed = content;
        for (const match of matches) {
            const [tag, relPath] = match;
            const absPath = path.normalize(path.join(rootPath, relPath));

            // 安全检查：防止路径穿越
            if (!absPath.startsWith(rootPath) || visited.has(absPath)) { continue; }

            try {
                visited.add(absPath);
                const fileUri = vscode.Uri.file(absPath);
                const rawContent = await vscode.workspace.fs.readFile(fileUri);
                let fileContent = new TextDecoder().decode(rawContent);
                
                // 递归解析，增加深度计数
                fileContent = await this.resolveReferences(fileContent, visited, depth + 1);
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
            const userUri = vscode.Uri.joinPath(workspaceFolder.uri, '.opengravity', 'SYSTEM.md');
            try {
                const content = await vscode.workspace.fs.readFile(userUri);
                return new TextDecoder().decode(content);
            } catch (e) {}
        }
        return this.loadInternalTemplate(extensionUri, 'SYSTEM.md');
    }

    /**
     * [Init 2.0] 检查业务工作流是否已初始化
     * 判定标准：检查核心业务目录 codes/ 是否存在
     */
    static async isWorkflowInitialized(): Promise<boolean> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return true; 
        const codesDir = vscode.Uri.joinPath(workspaceFolder.uri, 'codes');
        try {
            await vscode.workspace.fs.stat(codesDir);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * [Soul Sync] 塑造人格：注入灵魂地基
     * 只要打开工作区就运行。创建完整的 .opengravity 目录结构并同步核心身份文件、人格(Personas)及规范。
     */
    static async bootstrapSoul(extensionUri: vscode.Uri) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const configDirUri = vscode.Uri.joinPath(workspaceFolder.uri, '.opengravity');
        try {
            // 1. 创建地基：.opengravity 及其所有标准子目录
            const soulDirs = ['', 'skills', 'agents', 'codingstyle', 'commands', 'sessions', 'commands_prompt', 'memory'];
            for (const dir of soulDirs) {
                const dUri = vscode.Uri.joinPath(configDirUri, dir);
                try { await vscode.workspace.fs.stat(dUri); } catch (e) {
                    await vscode.workspace.fs.createDirectory(dUri);
                }
            }
            
            // 2. 注入核心身份文件
            const identityFiles = ['SYSTEM.md', 'IDENTITY.md', 'USER.md', 'INDEX.md', 'PROJECT_MAP.md', 'MEMORY.md', 'HEARTBEAT.md'];
            const srcRoot = vscode.Uri.joinPath(extensionUri, 'assets', 'templates');
            
            for (const file of identityFiles) {
                const src = vscode.Uri.joinPath(srcRoot, file);
                const dest = vscode.Uri.joinPath(configDirUri, file);
                try {
                    await vscode.workspace.fs.stat(dest);
                } catch (e) {
                    await vscode.workspace.fs.copy(src, dest, { overwrite: false });
                }
            }

            // 3. 注入人格与规范 (Personas & Styles)
            // 这些是 Opengravity 灵魂的一部分，不属于业务资产
            await this.syncDir(vscode.Uri.joinPath(srcRoot, 'agents'), vscode.Uri.joinPath(configDirUri, 'agents'), "Personas");
            await this.syncDir(vscode.Uri.joinPath(srcRoot, 'codingstyle'), vscode.Uri.joinPath(configDirUri, 'codingstyle'), "Coding Styles");
            await this.syncDir(vscode.Uri.joinPath(srcRoot, 'commands_prompt'), vscode.Uri.joinPath(configDirUri, 'commands_prompt'), "System Prompts");

            Logger.info(`[OPGV] Soul bootstrapped with personas and styles.`);
        } catch (e: any) {
            Logger.error(`[OPGV] Soul bootstrap failed: ${e.message}`);
        }
    }

    /**
     * [Workflow Init] 初始化业务逻辑
     * 由 /init 显式触发。仅负责搬入具体的生产指令 (TOML) 和技能 (MD)。
     */
    static async initializeWorkflow(extensionUri: vscode.Uri) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const configDirUri = vscode.Uri.joinPath(workspaceFolder.uri, '.opengravity');

        try {
            // 1. 搬入生产力指令 (从 workflow_assets 拷贝)
            await this.syncDir(
                vscode.Uri.joinPath(extensionUri, 'assets', 'workflow_assets', 'commands'),
                vscode.Uri.joinPath(configDirUri, 'commands'),
                "Production Commands"
            );

            // 2. 搬入进阶技能 (skills/*.md)
            await this.syncDir(
                vscode.Uri.joinPath(extensionUri, 'assets', 'templates', 'skills'),
                vscode.Uri.joinPath(configDirUri, 'skills'),
                "Advanced Skills"
            );

            Logger.info(`[OPGV] Workflow production assets deployed.`);
        } catch (error: any) {
            Logger.error(`[OPGV] Workflow init failed: ${error.message}`);
            throw error;
        }
    }

    private static async syncDir(srcUri: vscode.Uri, destUri: vscode.Uri, label: string) {
        const copyRecursive = async (src: vscode.Uri, dest: vscode.Uri) => {
            const entries = await vscode.workspace.fs.readDirectory(src);
            for (const [name, type] of entries) {
                const sUri = vscode.Uri.joinPath(src, name);
                const dUri = vscode.Uri.joinPath(dest, name);
                if (type === vscode.FileType.Directory) {
                    try { await vscode.workspace.fs.stat(dUri); } catch (e) { await vscode.workspace.fs.createDirectory(dUri); }
                    await copyRecursive(sUri, dUri);
                } else {
                    try { await vscode.workspace.fs.stat(dUri); } catch (e) { await vscode.workspace.fs.copy(sUri, dUri, { overwrite: false }); }
                }
            }
        };
        try {
            await copyRecursive(srcUri, destUri);
            Logger.info(`[OPGV] ${label} synchronized.`);
        } catch (e: any) { Logger.error(`[OPGV] Sync ${label} failed: ${e.message}`); }
    }
}
