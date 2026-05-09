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

}

module.exports = { registerPanelHostRoutes };
