const fetch = require('node-fetch');

const checkLicense = async () => {
    const response = await fetch('http://localhost:3000/license');
    const data = await response.json();
    if(data.status === 'active') {
        console.log('License active');
        return;
    }else{
        console.log('License expired');
        process.exit(1);
    }
};

module.exports = checkLicense;
