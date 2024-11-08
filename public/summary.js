// Add this at the beginning of your script.js or inline script
function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0) parts.push(`${remainingSeconds}s`);
    
    return parts.join(' ');
}
// Function to update summary
async function updateSummary() {
    try {
        const response = await fetch('/summary');
        const data = await response.json();
        
        document.getElementById('totalDisk').textContent = formatBytes(data.disk.total);
        document.getElementById('freeDisk').textContent = formatBytes(data.disk.free);
        document.getElementById('usedDisk').textContent = `${data.disk.usedPercentage}%`;
        document.getElementById('routerCount').textContent = data.routers;
        document.getElementById('logCount').textContent = data.totalLogs;
        document.getElementById('uptime').textContent = formatUptime(data.uptime);
    } catch (error) {
        console.error('Error fetching summary:', error);
    }
}

// Update summary every 30 seconds
updateSummary();
setInterval(updateSummary, 1000);