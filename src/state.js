class State {
    constructor() {
        this.startTime = Date.now();
        this.routers = new Map(); // Stores per-router statistics
    }

    initRouter(routerAddress) {
        if (!this.routers.has(routerAddress)) {
            this.routers.set(routerAddress, {
                syslogCount: 0,
                saveCount: 0,
                lastSeen: Date.now()
            });
        }
        return this.routers.get(routerAddress);
    }

    updateRouterStats(routerAddress, { syslog = false, save = false } = {}) {
        const router = this.initRouter(routerAddress);
        if (syslog) router.syslogCount++;
        if (save) router.saveCount++;
        router.lastSeen = Date.now();
    }

    getTotalStats() {
        return Array.from(this.routers.values()).reduce((totals, router) => {
            totals.syslogCount += router.syslogCount;
            totals.saveCount += router.saveCount;
            return totals;
        }, { syslogCount: 0, saveCount: 0 });
    }
}

module.exports = new State();
