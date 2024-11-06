const stringUtils = require('./stringUtils');
const timeUtils = require('./timeUtils');
const ipLookup = require('./ipLookup');
const routers = require('../routers.json');

const syslogProcessor = {
    // Cache to store PPPoE data for each router
    pppoeCache: new Map(),
    refreshIntervals: new Map(),

    // Initialize PPPoE cache for all routers
    async initializePPPoECache() {
        for (const router of routers) {
            if (router.ppoe) {
                try {
                    await this.refreshRouterCache(router);
                    // Set up refresh interval for this router
                    const intervalId = setInterval(
                        () => this.refreshRouterCache(router),
                        10 * 60 * 1000 // 10 minutes
                    );
                    this.refreshIntervals.set(router.ip, intervalId);
                } catch (error) {
                    console.error(`Failed to initialize PPPoE cache for router ${router.ip}:`, error);
                }
            }
        }
    },

    // Refresh PPPoE cache for a specific router
    async refreshRouterCache(router) {
        try {
            // Check if there's already an ongoing request
            if (ipLookup.hasOngoingRequest(router.ppoe.host, router.ppoe.port)) {
                console.log(`Waiting for ongoing PPPoE request for router ${router.ip}`);
                return;
            }

            const pppoeMap = await ipLookup.getPPPoEData({
                host: router.ppoe.host,
                user: router.ppoe.user,
                password: router.ppoe.password,
                port: router.ppoe.port
            });
            this.pppoeCache.set(router.ip, pppoeMap);
            console.log(`Refreshed PPPoE cache for router ${router.ip}`);
        } catch (error) {
            console.error(`Failed to refresh PPPoE cache for router ${router.ip}:`, error);
        }
    },

    async processMessage(info) {
        if (info.tag !== 'prerouting') return null;

        // Extract basic connection information first
        const protocol = stringUtils.cut(info.msg, 'proto ', ', ');
        const connection = stringUtils.cut(info.msg, protocol + ', ', ',');
        const { ip: local_ip, port: local_port } = this.ip_port_to_ip_and_port(connection.split('->')[0]);
        const { ip: remote_ip, port: remote_port } = this.ip_port_to_ip_and_port(connection.split('->')[1]);
        
        const nat = stringUtils.cut(info.msg, 'NAT (', ')');
        const { ip: nat_ip, port: nat_port } = this.ip_port_to_ip_and_port(nat.split('->')[1]);
        const mac = stringUtils.cut(info.msg, 'src-mac ', ', ');

        // Try to get user_id directly from message first
        let user_id = stringUtils.cut(info.msg, 'in:<', '>');

        // If no direct user_id, try PPPoE lookup
        if (!user_id) {
            const router = routers.find(r => r.ip === info.address);
            if (router && router.ppoe) {
                try {
                    const pppoeMap = this.pppoeCache.get(router.ip);
                    if (pppoeMap) {
                        try {
                            user_id = ipLookup.lookupUsernameByIP(local_ip, pppoeMap);
                        } catch (error) {
                            // Username not found in cache, trigger a cache refresh if no ongoing request
                            if (!ipLookup.hasOngoingRequest(router.ppoe.host, router.ppoe.port)) {
                                console.log(`Username not found for IP ${local_ip}, refreshing PPPoE cache for router ${router.ip}`);
                                this.refreshRouterCache(router).catch(err => {
                                    console.error('Error refreshing cache:', err);
                                });
                            } else {
                                console.log(`Username not found for IP ${local_ip}, waiting for ongoing PPPoE request`);
                            }
                            user_id = 'unknown';
                        }
                    }
                } catch (error) {
                    console.error('Error in PPPoE lookup:', error);
                    user_id = 'unknown';
                }
            }
        }

        const gmtPlus6Date = new Date(new Date().getTime() + 6 * 60 * 60 * 1000);
        return {
            time: timeUtils.formatDate(gmtPlus6Date.toISOString()),
            router_ip: info.address,
            user_id,
            protocol,
            mac,
            local_ip,
            local_port,
            remote_ip,
            remote_port,
            nat_ip,
            nat_port
        };
    },

    formatLogLine(data) {
        return `${data.time},${data.router_ip},${data.user_id},"${data.protocol}",${data.mac},${data.local_ip},${data.local_port},${data.remote_ip},${data.remote_port},${data.nat_ip},${data.nat_port}\n`;
    },

    ip_port_to_ip_and_port(ip_port) {
        const [ip, port] = ip_port.split(':');
        return { ip, port };
    }
};

// Initialize the PPPoE cache when the module loads
syslogProcessor.initializePPPoECache().catch(error => {
    console.error('Failed to initialize PPPoE cache:', error);
});

module.exports = syslogProcessor;
