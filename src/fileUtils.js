const fs = require('fs').promises;
const path = require('path');
const CONFIG = require('./config');
const state = require('./state');

const fileUtils = {
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    },

    async writeToFile(routerAddress, filename, newData) {
        const routerDir = path.join(CONFIG.LOG_BASE_DIR, routerAddress);
        await this.ensureDirectoryExists(routerDir);
        
        const filePath = path.join(routerDir, filename);
        try {
            await fs.writeFile(filePath, newData, { flag: 'a' });
            state.updateRouterStats(routerAddress, { save: true });
        } catch (err) {
            console.error(`Error writing to file for router ${routerAddress}:`, err);
        }
    },

    async getLogFiles(directory) {
        try {
            const routerDirs = await fs.readdir(directory);
            const allFiles = [];

            for (const routerDir of routerDirs) {
                const routerPath = path.join(directory, routerDir);
                const stat = await fs.stat(routerPath);
                
                if (stat.isDirectory()) {
                    const files = await fs.readdir(routerPath);
                    const logFiles = files.filter(file => file.endsWith('.log'));
                    allFiles.push(...logFiles.map(file => ({
                        router: routerDir,
                        file: file,
                        path: path.join(routerPath, file)
                    })));
                }
            }
            return allFiles;
        } catch (err) {
            console.error('Unable to scan directories:', err);
            return [];
        }
    },

    async searchInFile(fileInfo, query) {
        try {
            const data = await fs.readFile(fileInfo.path, 'utf-8');
            const matches = data
                .split('\n')
                .filter(line => line.trim() && line.includes(query))
                .map(line => ({
                    router: fileInfo.router,
                    file: fileInfo.file,
                    content: line
                }));
            return matches;
        } catch (error) {
            console.error(`Error searching file ${fileInfo.path}:`, error);
            return [];
        }
    },

    async readLogFile(fileInfo) {
        try {
            const data = await fs.readFile(fileInfo.path, 'utf-8');
            const lines = data
                .split('\n')
                .filter(line => line.trim())
                .map(line => ({
                    router: fileInfo.router,
                    file: fileInfo.file,
                    content: line
                }));
            return lines;
        } catch (error) {
            console.error(`Error searching file ${fileInfo.path}:`, error);
            return [];
        }
    }
};

module.exports = fileUtils;
