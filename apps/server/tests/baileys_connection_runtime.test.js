const test = require('node:test');
const assert = require('node:assert/strict');

const {
    resolveWhatsappVersion,
    shouldResetWhatsappAuth
} = require('../baileys_connection_runtime');

test('prefers the live WhatsApp Web version', async () => {
    const result = await resolveWhatsappVersion({
        fetchLatestWaWebVersion: async () => ({ version: [2, 3000, 1043857760], isLatest: true }),
        fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1035194821], isLatest: true })
    });

    assert.deepEqual(result.version, [2, 3000, 1043857760]);
    assert.equal(result.source, 'wa_web_live');
});

test('falls back to the version bundled by Baileys', async () => {
    const result = await resolveWhatsappVersion({
        fetchLatestWaWebVersion: async () => { throw new Error('offline'); },
        fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1035194821], isLatest: true })
    });

    assert.deepEqual(result.version, [2, 3000, 1035194821]);
    assert.equal(result.source, 'baileys_release');
});

test('does not block startup when the live version lookup hangs', async () => {
    const result = await resolveWhatsappVersion({
        fetchLatestWaWebVersion: async () => new Promise(() => {}),
        fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1035194821], isLatest: true }),
        timeoutMs: 100
    });

    assert.equal(result.source, 'baileys_release');
});

test('preserves auth on client-too-old and resets only on logout', () => {
    assert.equal(shouldResetWhatsappAuth(405, { loggedOut: 401 }), false);
    assert.equal(shouldResetWhatsappAuth(428, { loggedOut: 401 }), false);
    assert.equal(shouldResetWhatsappAuth(401, { loggedOut: 401 }), true);
});
