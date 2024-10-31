const express = require('express');
const cors = require('cors');
const path = require('path');
const CONFIG = require('./config');
const fileUtils = require('./fileUtils');
const state = require('./state');
const nodeDiskInfo = require('node-disk-info');

const setupExpress = () => {
    const app = express();
    app.use(cors());
    
    // Serve static files from the 'public' directory
    app.use(express.static('public'));

    // Home route
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'index.html'));
    });

    // Get system summary
    app.get('/summary', async (req, res) => {
        try {
            // Get disk info
            const disks = await nodeDiskInfo.getDiskInfo();
            const systemDisk = disks.find(disk => disk.mounted === 'C:') || disks[0];
            
            // Get router and log counts
            const logFiles = await fileUtils.getLogFiles(CONFIG.LOG_BASE_DIR);
            const uniqueRouters = [...new Set(logFiles.map(file => file.router))];
            
            // Calculate uptime
            const uptimeInSeconds = Math.floor((Date.now() - state.startTime) / 1000);
            
            const summary = {
                disk: {
                    total: systemDisk.blocks,
                    free: systemDisk.available,
                    used: systemDisk.used,
                    usedPercentage: ((systemDisk.used / systemDisk.blocks) * 100).toFixed(2)
                },
                routers: uniqueRouters.length,
                totalLogs: logFiles.length,
                uptime: uptimeInSeconds
            };
            
            res.send(summary);
        } catch (error) {
            console.error('Error getting system summary:', error);
            res.status(500).send({ error: 'Internal server error' });
        }
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

            const allLogLines = await Promise.all(routerFiles.map(file => fileUtils.readLogFile(file)));
            const result = allLogLines.flat();

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

module.exports = setupExpress;
