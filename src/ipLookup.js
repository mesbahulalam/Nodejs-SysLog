const RouterOSAPI = require('node-routeros').RouterOSAPI;

// Track ongoing PPPoE requests per router
const ongoingRequests = new Map();

/**
 * Get PPPoE data from router and store in a map
 * @param {Object} config Router connection configuration
 * @returns {Map<string, string>} Map of IP addresses to usernames
 */
async function getPPPoEData(config) {
    const routerKey = `${config.host}:${config.port}`;
    
    // If there's an ongoing request for this router, wait for it
    if (ongoingRequests.has(routerKey)) {
        return await ongoingRequests.get(routerKey);
    }

    const requestPromise = new Promise(async (resolve, reject) => {
        const pppoeMap = new Map();
        const api = new RouterOSAPI(config);

        try {
            await api.connect();
            const pppActive = await api.write('/ppp/active/print');
            
            // Store each active connection's IP and username
            pppActive.forEach(conn => {
                pppoeMap.set(conn.address, conn.name);
            });

            resolve(pppoeMap);
            
        } catch (error) {
            reject(new Error(`Failed to get PPPoE data: ${error.message}`));
        } finally {
            if (api.connected) {
                await api.close();
            }
            // Remove the request from tracking once completed
            ongoingRequests.delete(routerKey);
        }
    });

    // Store the ongoing request
    ongoingRequests.set(routerKey, requestPromise);
    
    return await requestPromise;
}

/**
 * Get username for an IP address from PPPoE data map
 * @param {string} ipAddress IP address to lookup
 * @param {Map<string, string>} pppoeMap Map containing IP to username mappings
 * @returns {string} Username associated with the IP
 */
function lookupUsernameByIP(ipAddress, pppoeMap) {
    if (!pppoeMap || !(pppoeMap instanceof Map)) {
        throw new Error('Invalid PPPoE data map provided');
    }

    if (!ipAddress) {
        throw new Error('IP address is required');
    }

    const username = pppoeMap.get(ipAddress);
    if (!username) {
        throw new Error(`No username found for IP: ${ipAddress}`);
    }

    return username;
}

/**
 * Check if there's an ongoing PPPoE request for a router
 * @param {string} host Router host
 * @param {number} port Router port
 * @returns {boolean} Whether there's an ongoing request
 */
function hasOngoingRequest(host, port) {
    return ongoingRequests.has(`${host}:${port}`);
}

module.exports = {
    getPPPoEData,
    lookupUsernameByIP,
    hasOngoingRequest
};
