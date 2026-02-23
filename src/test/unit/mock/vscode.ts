import { jest } from '@jest/globals';

export const window = {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    activeTextEditor: undefined,
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        show: jest.fn()
    })),
    showTextDocument: jest.fn()
};

export const workspace = {
    getConfiguration: jest.fn(),
    workspaceFolders: undefined as any,
    openTextDocument: jest.fn(),
    fs: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        mkdir: jest.fn(),
        stat: jest.fn()
    }
};

export class Uri {
    static parse = jest.fn((val: string) => ({ fsPath: val, toString: () => val }));
    static file = jest.fn((path: string) => ({ fsPath: path, toString: () => `file://${path}` }));
    fsPath: string = '';
}

export const commands = {
    executeCommand: jest.fn()
};
