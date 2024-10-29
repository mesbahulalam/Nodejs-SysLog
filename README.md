# Nodejs-SysLog
A Syslog server.

# Mikrotik Config

/ip firewall mangle
chain=prerouting action=log protocol=tcp in-interface=all-ppp log=no log-prefix=""

/ip firewall filter
add action=log chain=input in-interface=all-ppp protocol=tcp

/system logging
add action=test topics=firewall

/system logging action
add name=test remote=10.6.207.217 target=remote

# Using
https://www.npmjs.com/package/syslogd
