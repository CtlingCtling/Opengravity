module.exports = {
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    testEnvironment: 'node',
    testMatch: ['**/src/test/unit/**/*.test.ts'],
    moduleNameMapper: {
        '^vscode$': '<rootDir>/src/test/unit/mock/vscode.ts'
    }
};