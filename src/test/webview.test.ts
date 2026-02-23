import * as fs from 'fs';
import * as path from 'path';

describe('WebView Refactoring Test', () => {
    const webviewDir = path.join(__dirname, '../webview');
    
    it('Check if webview files exist', async () => {
        await fs.promises.access(path.join(webviewDir, 'chat.html'));
        await fs.promises.access(path.join(webviewDir, 'chat.css'));
        await fs.promises.access(path.join(webviewDir, 'chat.js'));
    });

    it('Check HTML placeholders', async () => {
        const html = await fs.promises.readFile(path.join(webviewDir, 'chat.html'), 'utf8');
        expect(html.includes('{{styleUri}}')).toBe(true);
        expect(html.includes('{{scriptUri}}')).toBe(true);
    });

    it('Check component structure in JS', async () => {
        const js = await fs.promises.readFile(path.join(webviewDir, 'chat.js'), 'utf8');
        expect(js.includes('class ChatBox')).toBe(true);
        expect(js.includes('class InputBar')).toBe(true);
    });
});
