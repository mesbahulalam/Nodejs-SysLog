const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const CONFIG = require('./config');
const fileUtils = require('./fileUtils');
const state = require('./state');
const userManager = require('./userManager');
const nodeDiskInfo = require('node-disk-info');
const fs = require('fs').promises;

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

    // Advanced search endpoint
    app.post('/advanced-search', async (req, res) => {
        const {
            routerId,
            timeStart,
            timeEnd,
            userId,
            protocol,
            mac,
            localIp,
            localPort,
            remoteIp,
            remotePort,
            natIp,
            natPort
        } = req.body;

        try {
            // Get all log files or filter by router if specified
            const logFiles = await fileUtils.getLogFiles(CONFIG.LOG_BASE_DIR);
            const targetFiles = routerId 
                ? logFiles.filter(f => f.router === routerId)
                : logFiles;

            if (targetFiles.length === 0) {
                return res.json([]);
            }

            // Read all matching log files
            const allLogLines = await Promise.all(targetFiles.map(file => fileUtils.readLogFile(file)));
            let results = allLogLines.flat();

            // Filter results based on search criteria
            results = results.filter(log => {
                const parts = log.content.split(',').map(part => part.trim().replace(/"/g, ''));
                const logTime = new Date(parts[0]);
                
                // Time range filter
                if (timeStart && logTime < new Date(timeStart)) return false;
                if (timeEnd && logTime > new Date(timeEnd)) return false;
                
                // Other filters
                if (userId && !parts[2].toLowerCase().includes(userId.toLowerCase())) return false;
                if (protocol && !parts[3].toLowerCase().includes(protocol.toLowerCase())) return false;
                if (mac && !parts[4].toLowerCase().includes(mac.toLowerCase())) return false;
                if (localIp && !parts[5].toLowerCase().includes(localIp.toLowerCase())) return false;
                if (localPort && !parts[6].includes(localPort)) return false;
                if (remoteIp && !parts[7].toLowerCase().includes(remoteIp.toLowerCase())) return false;
                if (remotePort && !parts[8].includes(remotePort)) return false;
                if (natIp && !parts[9].toLowerCase().includes(natIp.toLowerCase())) return false;
                if (natPort && !parts[10].includes(natPort)) return false;

                return true;
            });

            res.json(results);
        } catch (error) {
            console.error('Error processing advanced search:', error);
            res.status(500).send({ error: 'Internal server error' });
        }
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

    // Get list of all routers
    app.get('/routers', async (req, res) => {
        try {
            const routers = await fileUtils.readJsonFile('routers.json');
            if (!routers) {
                return res.status(500).json({ error: 'Failed to read routers data' });
            }
            res.json(routers);
        } catch (error) {
            console.error('Error getting router list:', error);
            res.status(500).send({ error: 'Internal server error' });
        }
    });

    // Register a new router
    app.post('/routers/register', async (req, res) => {
        try {
            const { name, ip, ppoe } = req.body;

            // Validate required fields
            if (!name || !ip || !ppoe) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Read existing routers
            const routers = await fileUtils.readJsonFile('routers.json') || [];

            // Check if router with same name or IP already exists
            if (routers.some(r => r.name === name || r.ip === ip)) {
                return res.status(400).json({ error: 'Router with same name or IP already exists' });
            }

            // Add new router
            routers.push({ name, ip, ppoe });

            // Save updated routers
            const success = await fileUtils.writeJsonFile('routers.json', routers);
            if (!success) {
                return res.status(500).json({ error: 'Failed to save router data' });
            }

            res.json({ message: 'Router registered successfully' });
        } catch (error) {
            console.error('Error registering router:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Remove a router
    app.delete('/routers/:routerId', async (req, res) => {
        try {
            const { routerId } = req.params;

            // Read existing routers
            const routers = await fileUtils.readJsonFile('routers.json') || [];

            // Find router index
            const routerIndex = routers.findIndex(r => r.name === routerId || r.ip === routerId);

            if (routerIndex === -1) {
                return res.status(404).json({ error: 'Router not found' });
            }

            // Remove router
            routers.splice(routerIndex, 1);

            // Save updated routers
            const success = await fileUtils.writeJsonFile('routers.json', routers);
            if (!success) {
                return res.status(500).json({ error: 'Failed to save router data' });
            }

            res.json({ message: 'Router removed successfully' });
        } catch (error) {
            console.error('Error removing router:', error);
            res.status(500).json({ error: 'Internal server error' });
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
