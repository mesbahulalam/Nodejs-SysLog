const stringUtils = {
    cut(content, start, end, preserve = false) {
        if (!content || !start || !end) return '';
        
        const parts = content.split(start);
        if (parts.length < 2) return '';
        
        const innerParts = parts[1].split(end);
        return preserve ? start + innerParts[0] + end : innerParts[0];
    }
};

module.exports = stringUtils;
