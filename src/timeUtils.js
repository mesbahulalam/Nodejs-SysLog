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

module.exports = timeUtils;
