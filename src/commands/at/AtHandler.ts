import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandContext, CommandResult } from '../ICommand';
import { Logger } from '../../utils/logger';

/**
 * AtHandler: 处理以 '@' 开头的上下文注入指令
 * 逻辑参考自 opengravity-logic 的 atCommandProcessor.ts
 */
export class AtHandler {
    // 忽略的目录和文件黑名单 (Smart Filtering)
    private static readonly IGNORE_LIST = new Set([
        '.git', 'node_modules', 'dist', 'out', '.DS_Store', 
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.vscode'
    ]);
    
    // 允许注入的文本文件后缀
    private static readonly ALLOWED_EXTENSIONS = new Set([
        '.ts', '.js', '.c', '.cpp', '.h', '.py', '.md', 
        '.json', '.txt', '.toml', '.rs', '.go', '.sh', '.css', '.html'
    ]);

    /**
     * 执行处理逻辑
     * @param inputPath 已由 Dispatcher 正则解析出的路径
     */
    static async handle(inputPath: string, context: CommandContext): Promise<CommandResult | null> {
        if (!inputPath) {
            return { status: 'error', message: '请输入路径，例如: @src/index.ts 或 @"my folder/"' };
        }

        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!rootPath) {
            return { status: 'error', message: '当前未打开任何工作区' };
        }

        const absolutePath = path.normalize(path.join(rootPath, inputPath));
        if (!absolutePath.startsWith(rootPath)) {
            return { status: 'error', message: '禁止访问工作区以外的路径' };
        }

        try {
            const stats = await fs.promises.stat(absolutePath);
            
            if (stats.isDirectory()) {
                return await this.handleDirectory(absolutePath, inputPath, rootPath, context);
            } else {
                return await this.handleFile(absolutePath, inputPath, context);
            }

        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return { status: 'error', message: `路径未找到: ${inputPath}` };
            }
            Logger.error(`[OPGV] AtHandler Error: ${error.message}`);
            return { status: 'error', message: `处理请求失败: ${error.message}` };
        }
    }

    private static async handleFile(absPath: string, relPath: string, context: CommandContext): Promise<CommandResult> {
        const content = await fs.promises.readFile(absPath, 'utf-8');
        
        // 使用结构化界定符 (参考 opengravity-logic)
        const injectionMessage = [
            `REFERENCE_CONTENT_START: ${relPath}`,
            "```",
            content,
            "```",
            `REFERENCE_CONTENT_END: ${relPath}`,
            "",
            "请基于以上提供的参考内容进行回答。"
        ].join('\n');
        
        await context.onInjectMessage(injectionMessage);
        return { status: 'success', message: `已注入文件上下文: ${path.basename(absPath)}` };
    }

    private static async handleDirectory(absPath: string, relPath: string, rootPath: string, context: CommandContext): Promise<CommandResult> {
        const allFiles: string[] = [];
        await this.scanDirectory(absPath, allFiles);

        if (allFiles.length === 0) {
            return { status: 'error', message: '目录下没有找到可注入的文本文件 (已自动过滤忽略名单)' };
        }

        const MAX_FILES = 20;
        const filesToInject = allFiles.slice(0, MAX_FILES);
        
        let combinedContent = `REFERENCE_DIRECTORY_START: ${relPath} (${filesToInject.length} files)\n\n`;
        
        for (const f of filesToInject) {
            try {
                const content = await fs.promises.readFile(f, 'utf-8');
                const relativeToRoot = path.relative(rootPath, f);
                combinedContent += `--- FILE_START: ${relativeToRoot} ---\n\`\`\`\n${content}\n\`\`\`\n--- FILE_END ---\n\n`;
            } catch (e) {
                Logger.warn(`[OPGV] Failed to read file during directory scan: ${f}`);
            }
        }

        combinedContent += `REFERENCE_DIRECTORY_END: ${relPath}\n\n请基于以上目录上下文进行分析。`;
        
        await context.onInjectMessage(combinedContent);

        const msg = allFiles.length > MAX_FILES 
            ? `已自动注入前 ${MAX_FILES} 个文件（共发现 ${allFiles.length} 个）` 
            : `已成功注入目录下的 ${allFiles.length} 个文件`;

        return { status: 'success', message: msg };
    }

    private static async scanDirectory(dir: string, fileList: string[]) {
        const files = await fs.promises.readdir(dir);
        
        for (const file of files) {
            // 过滤逻辑：跳过隐藏文件/文件夹以及黑名单成员
            if (file.startsWith('.') || this.IGNORE_LIST.has(file)) {
                continue;
            }

            const fullPath = path.join(dir, file);
            try {
                const stats = await fs.promises.stat(fullPath);

                if (stats.isDirectory()) {
                    await this.scanDirectory(fullPath, fileList);
                } else {
                    const ext = path.extname(file).toLowerCase();
                    if (this.ALLOWED_EXTENSIONS.has(ext)) {
                        fileList.push(fullPath);
                    }
                }
            } catch (e) {
                // 忽略权限错误或其他扫描异常
            }
        }
    }
}
