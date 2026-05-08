const path = require('path');

function registerPanelHostRoutes({
    app,
    express,
    fs,
    rootDir,
    updatesDir,
    panelV2Dist,
    landingDist,
    landingHosts,
    appPanelBaseUrl
}) {
    const panelV2Exists = fs.existsSync(panelV2Dist);
    const receptionPathAliases = [
        '/LINKDEDOWNLOADRECEPCAO',
        '/linkdedownloadrecepcao',
        '/download-recepcao',
        '/download-reception'
    ];
    const receptionMdbReaderPathAliases = [
        '/programarecepcao',
        '/programa-recepcao'
    ];

    function getRequestHost(req) {
        const forwardedHostRaw = String(req.get('x-forwarded-host') || '').trim();
        const forwardedHost = forwardedHostRaw
            ? forwardedHostRaw.split(',')[0].trim()
            : '';
        const hostCandidate = forwardedHost || String(req.get('host') || '').trim();
        return hostCandidate.split(':')[0].trim().toLowerCase();
    }

    function isLandingHost(host) {
        return landingHosts.has(String(host || '').toLowerCase());
    }

    function isLegacyAppPanelHost(host) {
        const normalized = String(host || '').toLowerCase();
        return normalized === 'app.academiaoxigenio.com'
            || normalized === 'app.academiaoxigenio.com.br';
    }

    function getPublicOrigin(host) {
        const normalized = String(host || '').toLowerCase();
        if (normalized.endsWith('.com.br') || normalized === 'academiaoxigenio.com.br') {
            return 'https://www.academiaoxigenio.com.br';
        }
        return 'https://www.academiaoxigenio.com';
    }

    function getPanelBaseUrl(host) {
        if (appPanelBaseUrl) return appPanelBaseUrl.replace(/\/+$/, '');
        return `${getPublicOrigin(host)}/painel`;
    }

    function redirectToPanel(req, res) {
        const host = getRequestHost(req);
        return res.redirect(getPanelBaseUrl(host));
    }

    function sendPanelIndex(res) {
        if (panelV2Exists) {
            const panelIndex = path.join(panelV2Dist, 'index.html');
            if (fs.existsSync(panelIndex)) return res.sendFile(panelIndex);
        }
        return res.status(503).send('Painel indisponivel. Gere o build do panel-v2 e tente novamente.');
    }

    function sendLandingIndex(res) {
        const landingIndex = path.join(landingDist, 'index.html');
        if (fs.existsSync(landingIndex)) return res.sendFile(landingIndex);
        return sendPanelIndex(res);
    }

    function listZipCandidates(dirPath, nameRegex = null) {
        if (!dirPath || !fs.existsSync(dirPath)) return [];
        try {
            return fs.readdirSync(dirPath)
                .map((name) => {
                    const fullPath = path.join(dirPath, name);
                    const stat = fs.statSync(fullPath);
                    if (!stat.isFile()) return null;
                    if (!/\.zip$/i.test(name)) return null;
                    if (nameRegex && !nameRegex.test(name)) return null;
                    return { fullPath, name, mtimeMs: Number(stat.mtimeMs || 0) };
                })
                .filter(Boolean)
                .sort((a, b) => b.mtimeMs - a.mtimeMs);
        } catch (_) {
            return [];
        }
    }

    function resolveReceptionDownloadFile() {
        const candidates = [];
        const updatesBaseDir = updatesDir && String(updatesDir).trim()
            ? path.resolve(updatesDir)
            : path.join(rootDir, 'updates');
        const updatesReceptionDir = path.join(updatesBaseDir, 'reception');
        const distReceptionDir = path.resolve(rootDir, '..', '..', 'dist-recepcao');
        const preferredLatest = path.join(updatesReceptionDir, 'sca-sync-recepcao-latest.zip');
        if (fs.existsSync(preferredLatest)) {
            try {
                const stat = fs.statSync(preferredLatest);
                candidates.push({
                    fullPath: preferredLatest,
                    name: 'sca-sync-recepcao-latest.zip',
                    mtimeMs: Number(stat.mtimeMs || 0)
                });
            } catch (_) {}
        }
        candidates.push(...listZipCandidates(updatesReceptionDir));
        candidates.push(...listZipCandidates(distReceptionDir));
        candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
        return candidates[0] || null;
    }

    function resolveReceptionMdbReaderDownloadFile() {
        const candidates = [];
        const updatesBaseDir = updatesDir && String(updatesDir).trim()
            ? path.resolve(updatesDir)
            : path.join(rootDir, 'updates');
        const updatesReceptionDir = path.join(updatesBaseDir, 'reception');
        const distReceptionDir = path.resolve(rootDir, '..', '..', 'dist-recepcao');
        const preferredLatest = path.join(updatesReceptionDir, 'sca-mdb-reader-latest.zip');
        if (fs.existsSync(preferredLatest)) {
            try {
                const stat = fs.statSync(preferredLatest);
                candidates.push({
                    fullPath: preferredLatest,
                    name: 'sca-mdb-reader-latest.zip',
                    mtimeMs: Number(stat.mtimeMs || 0)
                });
            } catch (_) {}
        }
        candidates.push(...listZipCandidates(updatesReceptionDir, /^sca-mdb-reader-.*\.zip$/i));
        candidates.push(...listZipCandidates(distReceptionDir, /^sca-mdb-reader-.*\.zip$/i));
        candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
        return candidates[0] || null;
    }

    if (fs.existsSync(landingDist)) {
        app.use('/landing-assets', express.static(landingDist));
    }

    if (panelV2Exists) {
        const panelV2Static = express.static(panelV2Dist, { index: false, redirect: false });
        app.use('/panel_v2', panelV2Static);
        app.use('/painel', panelV2Static);
        app.use('/panel', (req, res) => {
            const host = getRequestHost(req);
            if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
            return res.redirect('/painel');
        });
        app.use('/painel-legado', (req, res) => redirectToPanel(req, res));
        app.use('/panel_legacy', (req, res) => redirectToPanel(req, res));

        app.use((req, res, next) => {
            const host = getRequestHost(req);
            if (isLandingHost(host)) return next();
            return panelV2Static(req, res, next);
        });
    }

    app.get('/', (req, res) => {
        const host = getRequestHost(req);
        if (isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        if (isLandingHost(host)) return sendLandingIndex(res);
        return sendPanelIndex(res);
    });

    app.get('/painel', (req, res) => {
        const host = getRequestHost(req);
        if (isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });

    app.get(/^\/painel\/.+$/, (req, res) => {
        const host = getRequestHost(req);
        if (isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });

    app.get('/panel', (req, res) => {
        const host = getRequestHost(req);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });

    app.get(/^\/panel\/.+$/, (req, res) => {
        const host = getRequestHost(req);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });

    app.get('/painel-legado', (req, res) => {
        return redirectToPanel(req, res);
    });

    app.get(/^\/painel-legado\/.+$/, (req, res) => {
        return redirectToPanel(req, res);
    });

    app.get('/panel_legacy', (req, res) => {
        return redirectToPanel(req, res);
    });

    app.get(/^\/panel_legacy\/.+$/, (req, res) => {
        return redirectToPanel(req, res);
    });

    app.get('/ponto', (req, res) => {
        const host = getRequestHost(req);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });

    app.get(/^\/ponto\/.+$/, (req, res) => {
        const host = getRequestHost(req);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });

    app.get(receptionPathAliases, (req, res) => {
        const file = resolveReceptionDownloadFile();
        if (!file) {
            return res.status(404).send('Pacote da recepcao nao encontrado. Gere o ZIP de sincronizacao SCA DB primeiro.');
        }
        res.setHeader('Cache-Control', 'no-store');
        return res.download(file.fullPath, file.name);
    });

    app.get(receptionMdbReaderPathAliases, (req, res) => {
        const file = resolveReceptionMdbReaderDownloadFile();
        if (!file) {
            return res.status(404).send('Pacote do programa de recepcao nao encontrado. Gere o ZIP sca-mdb-reader primeiro.');
        }
        res.setHeader('Cache-Control', 'no-store');
        return res.download(file.fullPath, file.name);
    });
}

module.exports = { registerPanelHostRoutes };
