import * as vscode from 'vscode';
import * as path from 'path';

export enum ProjectMode {
    Engineering = 'ENGINEERING',
    Script = 'SCRIPT'
}

/**
 * ProjectAnalyzer: 专门负责项目结构分析的工具类
 */
export class ProjectAnalyzer {
    // 标志性的工程文件
    private static readonly ENGINEERING_MARKERS = [
        'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 
        'requirements.txt', 'Makefile', 'CMakeLists.txt', 
        'tsconfig.json', '.git', 'build.gradle', 'pom.xml'
    ];

    // 忽略的目录
    private static readonly IGNORE_DIRS = new Set([
        'node_modules', '.git', 'dist', 'out', 'bin', 'obj', '.vscode', '.idea', 'target'
    ]);

    /**
     * 判定项目复杂度模式
     */
    static async assessMode(rootUri: vscode.Uri): Promise<ProjectMode> {
        try {
            const entries = await vscode.workspace.fs.readDirectory(rootUri);
            const hasMarker = entries.some(([name]) => 
                this.ENGINEERING_MARKERS.includes(name)
            );
            return hasMarker ? ProjectMode.Engineering : ProjectMode.Script;
        } catch (e) {
            return ProjectMode.Script; // 默认降级为脚本模式
        }
    }

    /**
     * 获取检测到的工程标志
     */
    static async getFoundMarkers(rootUri: vscode.Uri): Promise<string[]> {
        const entries = await vscode.workspace.fs.readDirectory(rootUri);
        return entries
            .map(([name]) => name)
            .filter(name => this.ENGINEERING_MARKERS.includes(name));
    }

    /**
     * 生成架构蓝图 (Mermaid Flowchart)
     */
    static async generateBlueprint(rootUri: vscode.Uri): Promise<string> {
        let mermaid = `graph TD
    Root[Project Root] -->|contains| Core`;
        
        const nodes: string[] = [];
        const edges: string[] = [];

        const scan = async (uri: vscode.Uri, parentNode: string, currentDepth: number) => {
            if (currentDepth > 2) return;
            const entries = await vscode.workspace.fs.readDirectory(uri);
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory) {
                    if (this.IGNORE_DIRS.has(name) || name.startsWith('.')) continue;
                    const nodeId = name.replace(/[^a-zA-Z0-9]/g, '_');
                    const isKeyDir = ['src', 'lib', 'app', 'packages', 'crates'].includes(name);
                    if (!nodes.includes(nodeId)) {
                        nodes.push(nodeId);
                        edges.push(`    ${parentNode} --> ${nodeId}[/${name}/]`);
                    }
                    if (isKeyDir || currentDepth < 1) {
                        await scan(vscode.Uri.joinPath(uri, name), nodeId, currentDepth + 1);
                    }
                }
            }
        };

        await scan(rootUri, "Root", 0);
        return edges.length === 0 ? `graph TD\n    Root[Project Root] -->|Single Level| Files[...]` : `${mermaid}\n${edges.join('\n')}`;
    }

    /**
     * 生成知识图谱 (Mermaid Mindmap)
     * 扫描 src/ 下的文件，提取核心类和函数定义
     */
    static async generateKnowledgeGraph(rootUri: vscode.Uri): Promise<string> {
        const srcUri = vscode.Uri.joinPath(rootUri, 'src');
        let mindmap = `mindmap
    root((Code Logic))`;

        try {
            const symbols = await this.extractSymbols(srcUri);
            if (symbols.length === 0) return `${mindmap}\n        No symbols found in src/`;

            // 构造 Mermaid Mindmap
            let content = mindmap;
            const grouped = this.groupSymbolsByFile(symbols);
            
            for (const [file, items] of Object.entries(grouped)) {
                content += `\n        ${file.replace(/\.[^/.]+$/, "")}`; // 文件名作为分支
                items.slice(0, 5).forEach(item => { // 每个文件展示前 5 个核心符号
                    content += `\n            ${item.replace(/[()]/g, "")}`;
                });
            }
            return content;
        } catch (e) {
            return `${mindmap}\n        Analysis Pending...`;
        }
    }

    private static async extractSymbols(dirUri: vscode.Uri): Promise<string[]> {
        const symbols: string[] = [];
        const skipFiles = ['.d.ts', '.test.ts', '.spec.ts'];

        const scan = async (uri: vscode.Uri, depth: number) => {
            if (depth > 2) return;
            const entries = await vscode.workspace.fs.readDirectory(uri);
            for (const [name, type] of entries) {
                const itemUri = vscode.Uri.joinPath(uri, name);
                if (type === vscode.FileType.Directory) {
                    if (!this.IGNORE_DIRS.has(name)) await scan(itemUri, depth + 1);
                } else if (type === vscode.FileType.File) {
                    if (['.ts', '.js', '.rs', '.py', '.c', '.h'].some(ext => name.endsWith(ext)) && !skipFiles.some(skip => name.endsWith(skip))) {
                        const content = await vscode.workspace.fs.readFile(itemUri);
                        const text = new TextDecoder().decode(content);
                        // 简单的正则匹配：类、接口、重要函数
                        const matches = text.match(/(?:class|interface|fn|function|export const)\s+([a-zA-Z0-9_]+)/g);
                        if (matches) symbols.push(...matches.map(m => `${name}: ${m.split(/\s+/).pop()}`));
                    }
                }
            }
        };

        try {
            await scan(dirUri, 0);
        } catch (e) {}
        return symbols;
    }

    private static groupSymbolsByFile(symbols: string[]): Record<string, string[]> {
        const groups: Record<string, string[]> = {};
        symbols.forEach(s => {
            const [file, sym] = s.split(': ');
            if (!groups[file]) groups[file] = [];
            if (!groups[file].includes(sym)) groups[file].push(sym);
        });
        return groups;
    }
}
