const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const Syslogd = require('syslogd');

// Constants
const CONFIG = {
    EXPRESS_PORT: 3000,
    SYSLOG_PORT: 514,
    CONSOLE_UPDATE_INTERVAL: 1000,
    LOG_BASE_DIR: 'logs'  // Base directory for router logs
};

// State management with per-router tracking
const state = {
    startTime: Date.now(),
    routers: new Map(), // Stores per-router statistics
    
    initRouter(routerAddress) {
        if (!this.routers.has(routerAddress)) {
            this.routers.set(routerAddress, {
                syslogCount: 0,
                saveCount: 0,
                lastSeen: Date.now()
            });
        }
        return this.routers.get(routerAddress);
    },

    updateRouterStats(routerAddress, { syslog = false, save = false } = {}) {
        const router = this.initRouter(routerAddress);
        if (syslog) router.syslogCount++;
        if (save) router.saveCount++;
        router.lastSeen = Date.now();
    },

    getTotalStats() {
        return Array.from(this.routers.values()).reduce((totals, router) => {
            totals.syslogCount += router.syslogCount;
            totals.saveCount += router.saveCount;
            return totals;
        }, { syslogCount: 0, saveCount: 0 });
    }
};

// File handling utilities
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

// Date and time utilities
const timeUtils = {
    formatDate(dateString) {
        const date = new Date(dateString);
        const pad = num => String(num).padStart(2, '0');
        
        return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} `
             + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
    },

    getFormattedFilename(router) {
        const now = new Date();
        const datePart = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getFullYear()).slice(-2)}`;
        const hour = now.getHours() % 12 || 12;
        const period = now.getHours() >= 12 ? 'PM' : 'AM';
        
        return `${datePart} ${hour}-00 ${period}.log`;
    },

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
};

// String manipulation utilities
const stringUtils = {
    cut(content, start, end, preserve = false) {
        if (!content || !start || !end) return '';
        
        const parts = content.split(start);
        if (parts.length < 2) return '';
        
        const innerParts = parts[1].split(end);
        return preserve ? start + innerParts[0] + end : innerParts[0];
    }
};

// Syslog processing
const syslogProcessor = {
    processMessage(info) {
        const user_id = stringUtils.cut(info.msg, 'in:<', '>');
        if (!user_id || info.tag !== 'prerouting') return null;

        const protocol = stringUtils.cut(info.msg, 'proto ', ', ');
        const connection = stringUtils.cut(info.msg, protocol + ', ', ', len');
        const [local_ip, remote_ip] = connection.split('->');

        return {
            // source: info.address,
            time: timeUtils.formatDate(new Date().toISOString()),
            user_id,
            protocol,
            mac: stringUtils.cut(info.msg, 'src-mac ', ', '),
            local_ip,
            remote_ip
        };
    },

    formatLogLine(data) {
        // return `${data.source},${data.time},${data.user_id},"${data.protocol}",${data.mac},${data.local_ip},${data.remote_ip}\n`;
        return `${data.time},${data.user_id},"${data.protocol}",${data.mac},${data.local_ip},${data.remote_ip}\n`;
    }
};

// Console output
const consoleManager = {
    formatRouterStats() {
        return Array.from(state.routers.entries())
            .map(([router, stats]) => {
                const timeSinceLastSeen = Math.floor((Date.now() - stats.lastSeen) / 1000);
                return `Router ${router}: Logs=${stats.syslogCount}, Saved=${stats.saveCount}, Last seen=${timeUtils.formatUptime(timeSinceLastSeen)} ago`;
            })
            .join('\n');
    },

    updateConsole() {
        const uptimeInSeconds = Math.floor((Date.now() - state.startTime) / 1000);
        const uptimeFormatted = timeUtils.formatUptime(uptimeInSeconds);
        const totalStats = state.getTotalStats();
        
        console.clear();
        console.log(`=== System Stats ===`);
        console.log(`Total Logs: ${totalStats.syslogCount}`);
        console.log(`Total Saved: ${totalStats.saveCount}`);
        console.log(`Uptime: ${uptimeFormatted}`);
        console.log('\n=== Router Stats ===');
        console.log(this.formatRouterStats());
    },

    startConsoleUpdates() {
        setInterval(() => this.updateConsole(), CONFIG.CONSOLE_UPDATE_INTERVAL);
    }
};

// Express server setup
const setupExpress = () => {
    const app = express();
    app.use(cors());
    
    // Serve static files from the 'public' directory
    // app.use(express.static('public'));

    // Home route
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });

    // Get list of all routers that have logs
    app.get('/routers', async (req, res) => {
        try {
            const logFiles = await fileUtils.getLogFiles(CONFIG.LOG_BASE_DIR);
            const uniqueRouters = [...new Set(logFiles.map(file => file.router))];
            res.send(uniqueRouters);
        } catch (error) {
            console.error('Error getting router list:', error);
            res.status(500).send({ error: 'Internal server error' });
        }
    });

    // Search across all router logs
    app.get('/search', async (req, res) => {
        const { query } = req.query;
        
        if (!query) {
            return res.status(400).send({ error: 'Query parameter is required' });
        }

        try {
            const logFiles = await fileUtils.getLogFiles(CONFIG.LOG_BASE_DIR);
            const searchPromises = logFiles.map(file => fileUtils.searchInFile(file, query));
            const results = await Promise.all(searchPromises);
            const allResults = results.flat();
            
            res.send(allResults);
        } catch (error) {
            console.error('Error processing search request:', error);
            res.status(500).send({ error: 'Internal server error' });
        }
    });

    // Search logs for a specific router
    app.get('/router/:routerId/search', async (req, res) => {
        const { routerId } = req.params;
        const { query } = req.query;

        if (!query) {
            return res.status(400).send({ error: 'Query parameter is required' });
        }

        try {
            const logFiles = await fileUtils.getLogFiles(CONFIG.LOG_BASE_DIR);
            const routerFiles = logFiles.filter(f => f.router === routerId);

            if (routerFiles.length === 0) {
                return res.status(404).send({ error: 'Router not found or has no logs' });
            }

            const searchPromises = routerFiles.map(file => fileUtils.searchInFile(file, query));
            const results = await Promise.all(searchPromises);
            const routerResults = results.flat();

            res.send(routerResults);
        } catch (error) {
            console.error('Error processing router search request:', error);
            res.status(500).send({ error: 'Internal server error' });
        }
    });

    // Get logs for a specific router
    app.get('/router/:routerId', async (req, res) => {
        const { routerId } = req.params;
        try {
            const logFiles = await fileUtils.getLogFiles(CONFIG.LOG_BASE_DIR);
            const routerFiles = logFiles.filter(f => f.router === routerId);

            if (routerFiles.length === 0) {
                return res.status(404).send({ error: 'Router not found or has no logs' });
            }

            // Sort files by modification time to get the latest file
            // const latestFile = routerFiles.sort((a, b) => fs.statSync(b.path).mtime - fs.statSync(a.path).mtime)[0];
            const latestFile = (await Promise.all(routerFiles.map(async file => ({
                ...file,
                mtime: (await fs.stat(file.path)).mtime
            })))).sort((a, b) => b.mtime - a.mtime)[0];

            const logLines = await fileUtils.readLogFile(latestFile);
            const result = logLines.flat();

            res.send(result);
        } catch (error) {
            console.error('Error getting router logs:', error);
            res.status(500).send({ error: 'Internal server error' });
        }
    });

    // Get router statistics
    app.get('/stats', (req, res) => {
        const routerStats = Array.from(state.routers.entries()).map(([address, stats]) => ({
            address,
            ...stats,
            lastSeenSeconds: Math.floor((Date.now() - stats.lastSeen) / 1000)
        }));
        res.send(routerStats);
    });

    app.listen(CONFIG.EXPRESS_PORT, () => {
        console.log(`Server running on http://localhost:${CONFIG.EXPRESS_PORT}/`);
    });
};

// Syslog server setup
const setupSyslog = () => {
    const handleSyslogMessage = async (info) => {
        state.updateRouterStats(info.address, { syslog: true });
        
        const processed = syslogProcessor.processMessage(info);
        if (!processed) return;

        const filename = timeUtils.getFormattedFilename(info.address);
        const logLine = syslogProcessor.formatLogLine(processed);
        
        await fileUtils.writeToFile(info.address, filename, logLine);
    };

    const syslogServer = Syslogd(handleSyslogMessage);
    syslogServer.listen(CONFIG.SYSLOG_PORT, (err) => {
        if (err) {
            console.error('Failed to start Syslog server:', err);
            return;
        }
        console.log('Syslog Server Started');
    });
};

// Initialize application
const init = async () => {
    // Ensure base log directory exists
    await fileUtils.ensureDirectoryExists(CONFIG.LOG_BASE_DIR);
    
    setupExpress();
    setupSyslog();
    consoleManager.startConsoleUpdates();
};

// Start the application
init().catch(err => {
    console.error('Failed to initialize application:', err);
    process.exit(1);
});
