/**
 * Simple utility to parse User-Agent strings into human-readable device/browser names.
 */
const parseUserAgent = (userAgent) => {
    if (!userAgent) return 'Unknown Device';

    const ua = userAgent.toLowerCase();

    // Check for common OS
    let os = 'Unknown OS';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'Mac';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
    else if (ua.includes('android')) os = 'Android';

    // Check for common Browser
    let browser = 'Unknown Browser';
    if (ua.includes('edg/')) browser = 'Edge';
    else if (ua.includes('chrome/') || ua.includes('chromium/')) browser = 'Chrome';
    else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('firefox/')) browser = 'Firefox';
    else if (ua.includes('opr/') || ua.includes('opera/')) browser = 'Opera';

    return `${browser} on ${os}`;
};

module.exports = {
    parseUserAgent
};
