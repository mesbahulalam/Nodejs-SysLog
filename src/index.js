const fileUtils = require('./fileUtils');
const setupExpress = require('./expressServer');
const setupSyslog = require('./syslogServer');
const consoleManager = require('./consoleManager');
const checkLicense = require('./license');

const init = async () => {
    // await checkLicense();
    
    // Ensure base log directory exists
    await fileUtils.ensureDirectoryExists('logs');
    
    setupExpress();
    setupSyslog();
    consoleManager.startConsoleUpdates();
};

// Start the application
init().catch(err => {
    console.error('Failed to initialize application:', err);
    process.exit(1);
});
