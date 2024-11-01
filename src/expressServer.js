const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const CONFIG = require('./config');
const fileUtils = require('./fileUtils');
const state = require('./state');
const userManager = require('./userManager');
const nodeDiskInfo = require('node-disk-info');

const setupExpress = () => {
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use(cookieParser());
    
    // Serve static files from the 'public' directory
    app.use(express.static('public'));

    // Authentication middleware
    const requireAuth = (req, res, next) => {
        const username = req.cookies.username;
        const hash = req.cookies.hash;

        if (!username || !hash || !userManager.validateSession(username, hash)) {
            if (req.path === '/login.html' || req.path === '/login') {
                next();
            } else {
                res.redirect('/login.html');
            }
            return;
        }
        next();
    };

    // Apply auth middleware to all routes except login
    app.use((req, res, next) => {
        if (req.path === '/login.html' || req.path === '/login' || req.path.startsWith('/style.css')) {
            next();
        } else {
            requireAuth(req, res, next);
        }
    });

    // Login route
    app.post('/login', (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        if (userManager.validateUser(username, password)) {
            const user = userManager.users.get(username);
            // Set cookies that expire in 24 hours
            res.cookie('username', username, { maxAge: 86400000, httpOnly: true });
            res.cookie('hash', user.hash, { maxAge: 86400000, httpOnly: true });
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    });

    // Logout route
    app.post('/logout', (req, res) => {
        res.clearCookie('username');
        res.clearCookie('hash');
        res.redirect('/login.html');
    });

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
