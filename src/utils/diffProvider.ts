import * as vscode from 'vscode';

/**
 * DiffContentProvider: 虚拟文档内容提供者
 * 用于在 VSCode 的 Diff 视图右侧展示 AI 修改后的内容。
 * 借鉴 gemini-cli 的虚拟文档机制。
 */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = 'opengravity-diff';
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this._onDidChange.event;

    // 存储待对比的内容：Map<uri_string, content_string>
    private static _contents = new Map<string, string>();

    /**
     * 更新并提供内容
     * @param uri 虚拟文档的 URI
     */
    provideTextDocumentContent(uri: vscode.Uri): string {
        return DiffContentProvider._contents.get(uri.toString()) || '';
    }

    /**
     * 向工厂注册一个待对比的文档
     * @param originalUri 原始文件的 URI
     * @param newContent 建议的新内容
     * @returns 构造好的虚拟 URI
     */
    public static register(originalUri: vscode.Uri, newContent: string): vscode.Uri {
        const diffUri = originalUri.with({ 
            scheme: this.scheme, 
            path: originalUri.path, // 保持原始路径以保留后缀高亮
            query: `time=${Date.now()}` // 增加时间戳防止缓存
        });
        this._contents.set(diffUri.toString(), newContent);
        return diffUri;
    }

    /**
     * 清理内容（防止内存泄漏）
     */
    public static clear(uri: vscode.Uri) {
        this._contents.delete(uri.toString());
    }
}
