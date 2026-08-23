function isValidWhatsappVersion(value) {
    return Array.isArray(value)
        && value.length === 3
        && value.every((part) => Number.isFinite(Number(part)) && Number(part) >= 0);
}

async function resolveWhatsappVersion({
    fetchLatestWaWebVersion,
    fetchLatestBaileysVersion,
    timeoutMs = 10000
} = {}) {
    const attempts = [
        ['wa_web_live', fetchLatestWaWebVersion],
        ['baileys_release', fetchLatestBaileysVersion]
    ];

    for (const [source, resolver] of attempts) {
        if (typeof resolver !== 'function') continue;
        let timeout = null;
        try {
            const result = await Promise.race([
                resolver(),
                new Promise((_, reject) => {
                    timeout = setTimeout(() => reject(new Error('version_lookup_timeout')), Math.max(100, Number(timeoutMs || 10000)));
                })
            ]);
            if (isValidWhatsappVersion(result?.version)) {
                return {
                    version: result.version.map((part) => Number(part)),
                    source,
                    isLatest: result?.isLatest !== false
                };
            }
        } catch (_) {
            // Try the next official version source.
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    return { version: null, source: 'baileys_default', isLatest: false };
}

function shouldResetWhatsappAuth(statusCode, disconnectReason = {}) {
    const code = Number(statusCode || 0);
    return code === Number(disconnectReason?.loggedOut || 401) || code === 401;
}

module.exports = {
    isValidWhatsappVersion,
    resolveWhatsappVersion,
    shouldResetWhatsappAuth
};
