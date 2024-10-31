const Syslogd = require('syslogd');
const CONFIG = require('./config');
const state = require('./state');
const syslogProcessor = require('./syslogProcessor');
const fileUtils = require('./fileUtils');
const timeUtils = require('./timeUtils');

const setupSyslog = () => {
    const handleSyslogMessage = async (info) => {
        state.updateRouterStats(info.address, { syslog: true });
        
        const processed = syslogProcessor.processMessage(info);
        if (!processed) return;

        const filename = timeUtils.getFormattedFilename(info.address);
        const logLine = syslogProcessor.formatLogLine(processed);
        
        await fileUtils.writeToFile(info.address, filename, logLine);
    };

    const syslogServer = Syslogd(handleSyslogMessage);
    syslogServer.listen(CONFIG.SYSLOG_PORT, (err) => {
        if (err) {
            console.error('Failed to start Syslog server:', err);
            return;
        }
        console.log('Syslog Server Started');
    });
};

module.exports = setupSyslog;
