import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/logger';

/**
 * SkillLoader: 提示词合成引擎
 * 负责解析和加载 Skill 模板，支持 {{args}} 替换和 @{.path} 递归引用。
 * 借鉴 gemini-cli 的 Prompt 编排思想。
 */
export class SkillLoader {
    private static readonly SKILL_REF_REGEX = /@\{([^}]+)\}/g;
    private static readonly ARGS_REGEX = /\{\{(args|input)\}\}/g;

    /**
     * 合成最终提示词
     * @param template 原始模板字符串
     * @param args 用户输入的参数
     */
    static async synthesize(template: string, args: string[]): Promise<string> {
        let result = template;

        // 1. 替换参数 {{args}} 或 {{input}}
        const argString = args.join(' ');
        result = result.replace(this.ARGS_REGEX, argString);

        // 2. 递归处理文件引用 @{.path}
        result = await this.resolveReferences(result, new Set<string>());

        return result;
    }

    /**
     * 递归解析 @{path} 引用
     * @param content 当前文本内容
     * @param visited 记录已访问路径，防止循环引用
     */
    private static async resolveReferences(content: string, visited: Set<string>): Promise<string> {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) return content;

        // 查找所有匹配项
        const matches = [...content.matchAll(this.SKILL_REF_REGEX)];
        if (matches.length === 0) return content;

        let processedContent = content;

        for (const match of matches) {
            const refTag = match[0]; // "@{.path}"
            const relPath = match[1]; // ".path"

            const absPath = path.normalize(path.join(rootPath, relPath));

            // 安全校验：禁止读取工作区外
            if (!absPath.startsWith(rootPath)) {
                Logger.warn(`[OPGV] SkillLoader: Blocked out-of-workspace reference: ${relPath}`);
                processedContent = processedContent.replace(refTag, `[Blocked Ref: ${relPath}]`);
                continue;
            }

            // 防止无限递归
            if (visited.has(absPath)) {
                Logger.warn(`[OPGV] SkillLoader: Circular reference detected: ${relPath}`);
                processedContent = processedContent.replace(refTag, `[Circular Ref: ${relPath}]`);
                continue;
            }

            try {
                visited.add(absPath);
                let fileContent = await fs.promises.readFile(absPath, 'utf-8');
                
                // 递归处理文件内部的引用
                fileContent = await this.resolveReferences(fileContent, visited);
                
                // 替换占位符
                processedContent = processedContent.replace(refTag, fileContent);
            } catch (error: any) {
                Logger.error(`[OPGV] SkillLoader: Failed to load ${relPath}: ${error.message}`);
                processedContent = processedContent.replace(refTag, `[Error Loading: ${relPath}]`);
            }
        }

        return processedContent;
    }
}
