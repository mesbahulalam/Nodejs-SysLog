const { machineId } = require('node-machine-id');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

class LicenseManager {
    constructor() {
        this.LICENSE_CACHE_FILE = path.join(process.cwd(), '.license-cache');
        this.API_ENDPOINT = 'https://localhost/validate-license'; // Replace with actual API endpoint
        this.cachedStatus = null;
        this.lastCheck = null;
        this.CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    }

    async getMachineId() {
        try {
            return await machineId(true);
        } catch (error) {
            console.error('Error getting machine ID:', error);
            throw new Error('Failed to generate machine ID');
        }
    }

    async loadCachedLicense() {
        try {
            const data = await fs.readFile(this.LICENSE_CACHE_FILE, 'utf8');
            const cache = JSON.parse(data);
            if (cache.machineId && cache.status && cache.timestamp) {
                this.cachedStatus = cache.status;
                this.lastCheck = new Date(cache.timestamp);
                return cache;
            }
        } catch (error) {
            // Cache file doesn't exist or is invalid
            return null;
        }
    }

    async saveLicenseCache(status, machineId) {
        const cache = {
            machineId,
            status,
            timestamp: new Date().toISOString()
        };
        try {
            await fs.writeFile(this.LICENSE_CACHE_FILE, JSON.stringify(cache));
        } catch (error) {
            console.error('Error saving license cache:', error);
        }
    }

    async validateWithServer(machineId) {
        try {
            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ machineId }),
                timeout: 5000 // 5 second timeout
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();
            return {
                valid: data.valid === true,
                message: data.message || 'License validation successful',
                expiryDate: data.expiryDate
            };
        } catch (error) {
            console.error('License validation error:', error);
            throw new Error('Failed to validate license with server');
        }
    }

    async checkLicense(force = false) {
        try {
            // Try to load cached license first
            const cached = await this.loadCachedLicense();
            const now = new Date();

            // Use cache if available and not expired and not forced refresh
            if (!force && cached && this.lastCheck && 
                (now.getTime() - this.lastCheck.getTime() < this.CHECK_INTERVAL)) {
                return {
                    valid: cached.status.valid,
                    message: cached.status.message,
                    cached: true
                };
            }

            // Get machine ID and validate with server
            const machineId = await this.getMachineId();
            const status = await this.validateWithServer(machineId);

            // Cache the new status
            await this.saveLicenseCache(status, machineId);
            this.cachedStatus = status;
            this.lastCheck = now;

            return {
                valid: status.valid,
                message: status.message,
                cached: false
            };
        } catch (error) {
            // If validation fails and we have cached data, use it as fallback
            if (this.cachedStatus) {
                return {
                    valid: this.cachedStatus.valid,
                    message: 'Using cached license status due to validation error',
                    cached: true,
                    error: error.message
                };
            }
            throw error;
        }
    }

    async initialize() {
        try {
            const status = await this.checkLicense(true);
            if (!status.valid) {
                console.error('License validation failed:', status.message);
                process.exit(1);
            }
            return status;
        } catch (error) {
            console.error('Failed to initialize license:', error);
            process.exit(1);
        }
    }
}

module.exports = new LicenseManager();
