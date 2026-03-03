import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

export interface SkillMetadata {
    name: string;
    description: string;
    path: string; // SKILL.md 的完整路径
    tier: 'workspace' | 'user'; // 技能层级
}

/**
 * SkillManager: 实现 Agent Skills (Anthropic 标准) 的发现与管理
 * 支持多层级发现：Workspace (项目)、User (全局 ~/)
 */
export class SkillManager {
    /**
     * 扫描所有层级的技能元数据
     */
    static async discoverSkills(): Promise<SkillMetadata[]> {
        const skills: SkillMetadata[] = [];

        // 1. 扫描 User 全局技能 (~/.opengravity/skills)
        // 注意：先扫全局，再扫局部，方便去重覆盖
        try {
            const userHome = os.homedir();
            const userDir = vscode.Uri.file(path.join(userHome, '.opengravity', 'skills'));
            const userSkills = await this.scanDir(userDir, 'user');
            skills.push(...userSkills);
        } catch (e) {
            // 全局目录可能不存在，忽略
        }

        // 2. 扫描 Workspace 技能 (.opengravity/skills)
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (root) {
            const workspaceDir = vscode.Uri.joinPath(root, '.opengravity', 'skills');
            const wsSkills = await this.scanDir(workspaceDir, 'workspace');
            skills.push(...wsSkills);
        }

        // 3. 去重逻辑：Workspace 优先于 User (利用 Map 后进覆盖先进)
        const uniqueSkills = new Map<string, SkillMetadata>();
        for (const s of skills) {
            uniqueSkills.set(s.name, s);
        }

        return Array.from(uniqueSkills.values());
    }

    private static async scanDir(dirUri: vscode.Uri, tier: 'workspace' | 'user'): Promise<SkillMetadata[]> {
        const found: SkillMetadata[] = [];
        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory) {
                    const skillMdUri = vscode.Uri.joinPath(dirUri, name, 'SKILL.md');
                    const metadata = await this.extractMetadata(skillMdUri, tier);
                    if (metadata) {
                        found.push(metadata);
                    }
                }
            }
        } catch (e) {
            // 目录不存在则跳过
        }
        return found;
    }

    private static async extractMetadata(uri: vscode.Uri, tier: 'workspace' | 'user'): Promise<SkillMetadata | null> {
        try {
            const contentRaw = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentRaw);

            // 使用正则匹配 YAML Frontmatter --- ... ---
            const match = content.match(/^---\s*([\s\S]*?)\s*---/);
            if (!match) return null;

            const yaml = match[1];
            const nameMatch = yaml.match(/name:\s*(.*)/);
            const descMatch = yaml.match(/description:\s*(.*)/);

            if (nameMatch && descMatch) {
                return {
                    name: nameMatch[1].trim(),
                    description: descMatch[1].trim(),
                    path: uri.fsPath,
                    tier: tier
                };
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    /**
     * 将技能列表转化为可注入系统提示词的文本
     */
    static formatSkillsForPrompt(skills: SkillMetadata[]): string {
        if (skills.length === 0) return "";

        let text = "\n\n## 🧬 Available Agent Skills:\n";
        text += "You possess specialized skills stored on disk. At startup, you only see these summaries. YOU MUST NOT guess their instructions. If you need a skill, you MUST call `activate_skill(name)` first to load the full instructions into your context.\n\n";
        
        for (const skill of skills) {
            const tierIcon = skill.tier === 'workspace' ? '🏠' : '🌍';
            text += `- [${skill.name}] (${tierIcon} ${skill.tier}): ${skill.description}\n`;
        }
        
        return text;
    }
}
