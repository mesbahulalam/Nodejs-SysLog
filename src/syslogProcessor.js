const stringUtils = require('./stringUtils');
const timeUtils = require('./timeUtils');

const syslogProcessor = {
    processMessage(info) {
        const user_id = stringUtils.cut(info.msg, 'in:<', '>');
        if (!user_id || info.tag !== 'prerouting') return null;

        const protocol = stringUtils.cut(info.msg, 'proto ', ', ');
        const connection = stringUtils.cut(info.msg, protocol + ', ', ', len');
        const { ip: local_ip, port: local_port } = this.ip_port_to_ip_and_port(connection.split('->')[0]);
        const { ip: remote_ip, port: remote_port } = this.ip_port_to_ip_and_port(connection.split('->')[1]);
        
        const nat = stringUtils.cut(info.msg, 'NAT (', ')');
        const { nat_ip, nat_port } = this.ip_port_to_ip_and_port(nat.split('->')[1]);

        const gmtPlus6Date = new Date(new Date().getTime() + 6 * 60 * 60 * 1000);
        return {
            time: timeUtils.formatDate(gmtPlus6Date.toISOString()),
            router_ip: info.address,
            user_id,
            protocol,
            mac: stringUtils.cut(info.msg, 'src-mac ', ', '),
            local_ip,
            local_port,
            remote_ip,
            remote_port,
            nat_ip,
            nat_port
        };
    },

    formatLogLine(data) {
        return `${data.time},${data.user_id},"${data.protocol}",${data.mac},${data.local_ip},${data.local_port},${data.remote_ip},${data.remote_port}\n`;
    },

    ip_port_to_ip_and_port(ip_port) {
        const [ip, port] = ip_port.split(':');
        return { ip, port };
    }
};

module.exports = syslogProcessor;
