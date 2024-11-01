const crypto = require('crypto');

class UserManager {
    constructor() {
        // In a production environment, this should be stored in a database
        this.users = new Map();
        
        // Add a default admin user
        this.addUser('admin', 'admin123');
    }

    addUser(username, password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = this.hashPassword(password, salt);
        this.users.set(username, { hash, salt });
    }

    hashPassword(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    }

    validateUser(username, password) {
        const user = this.users.get(username);
        if (!user) return false;

        const hash = this.hashPassword(password, user.salt);
        return hash === user.hash;
    }

    validateSession(username, hash) {
        const user = this.users.get(username);
        return user && user.hash === hash;
    }
}

module.exports = new UserManager();
