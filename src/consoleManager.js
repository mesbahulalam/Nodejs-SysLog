const CONFIG = require('./config');
const state = require('./state');
const timeUtils = require('./timeUtils');

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

module.exports = consoleManager;
