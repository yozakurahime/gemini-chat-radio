const path = require('path');

function registerPanelHostRoutes({
    app,
    express,
    fs,
    rootDir,
    panelDist,
    panelV2Dist,
    landingDist,
    panelV2Enabled,
    radioPageFile,
    landingHosts,
    appPanelBaseUrl
}) {
    function getRequestHost(req) {
        const forwardedHostRaw = String(req.get('x-forwarded-host') || '').trim();
        const forwardedHost = forwardedHostRaw
            ? forwardedHostRaw.split(',')[0].trim()
            : '';
        const hostCandidate = forwardedHost || String(req.get('host') || '').trim();
        return hostCandidate.split(':')[0].trim().toLowerCase();
    }

    function isRadioHost(host) {
        return String(host || '').includes('radio');
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

    function redirectToLegacyPanel(req, res) {
        const host = getRequestHost(req);
        return res.redirect(`${getPublicOrigin(host)}/painel-legado`);
    }

    function sendPanelIndex(res) {
        const panelIndex = panelV2Enabled
            ? path.join(panelV2Dist, 'index.html')
            : path.join(panelDist, 'index.html');
        if (fs.existsSync(panelIndex)) return res.sendFile(panelIndex);
        return res.sendFile(path.join(rootDir, 'atendimento.html'));
    }

    function sendLandingIndex(res) {
        const landingIndex = path.join(landingDist, 'index.html');
        if (fs.existsSync(landingIndex)) return res.sendFile(landingIndex);
        return sendPanelIndex(res);
    }

    function sendLegacyPanelIndex(res) {
        const legacyIndex = path.join(panelDist, 'index.html');
        if (fs.existsSync(legacyIndex)) return res.sendFile(legacyIndex);
        return sendPanelIndex(res);
    }

    app.use((req, res, next) => {
        const host = getRequestHost(req);
        if (isRadioHost(host) && (req.path === '/' || req.path === '/index.html')) {
            return res.sendFile(radioPageFile);
        }
        return next();
    });

    if (fs.existsSync(landingDist)) {
        app.use('/landing-assets', express.static(landingDist));
    }

    if (panelV2Enabled && fs.existsSync(panelV2Dist)) {
        const panelV2Static = express.static(panelV2Dist, { index: false, redirect: false });
        app.use('/panel_v2', express.static(panelV2Dist));
        app.use('/painel', panelV2Static);
        app.use('/panel', (req, res) => {
            const host = getRequestHost(req);
            if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
            return res.redirect('/painel');
        });
        app.use((req, res, next) => {
            const host = getRequestHost(req);
            if (isRadioHost(host) || isLandingHost(host)) return next();
            return panelV2Static(req, res, next);
        });

        if (fs.existsSync(panelDist)) {
            app.use('/painel-legado', express.static(panelDist, { index: false, redirect: false }));
            app.use('/panel_legacy', (req, res) => {
                const host = getRequestHost(req);
                if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToLegacyPanel(req, res);
                return res.redirect('/painel-legado');
            });
        }
    } else if (fs.existsSync(panelDist)) {
        const panelLegacyStatic = express.static(panelDist, { index: false, redirect: false });
        app.use('/painel', panelLegacyStatic);
        app.use('/panel', (req, res) => {
            const host = getRequestHost(req);
            if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
            return res.redirect('/painel');
        });
        app.use((req, res, next) => {
            const host = getRequestHost(req);
            if (isRadioHost(host) || isLandingHost(host)) return next();
            return panelLegacyStatic(req, res, next);
        });
    }

    app.get('/', (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        if (isLandingHost(host)) return sendLandingIndex(res);
        return sendPanelIndex(res);
    });
    app.get('/painel', (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });
    app.get(/^\/painel\/.+$/, (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });
    app.get('/panel', (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });
    app.get(/^\/panel\/.+$/, (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });
    app.get('/painel-legado', (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLegacyAppPanelHost(host)) return redirectToLegacyPanel(req, res);
        return sendLegacyPanelIndex(res);
    });
    app.get(/^\/painel-legado\/.+$/, (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLegacyAppPanelHost(host)) return redirectToLegacyPanel(req, res);
        return sendLegacyPanelIndex(res);
    });
    app.get('/panel_legacy', (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToLegacyPanel(req, res);
        return sendLegacyPanelIndex(res);
    });
    app.get(/^\/panel_legacy\/.+$/, (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToLegacyPanel(req, res);
        return sendLegacyPanelIndex(res);
    });
    app.get('/ponto', (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });
    app.get(/^\/ponto\/.+$/, (req, res) => {
        const host = getRequestHost(req);
        if (isRadioHost(host)) return res.sendFile(radioPageFile);
        if (isLandingHost(host) || isLegacyAppPanelHost(host)) return redirectToPanel(req, res);
        return sendPanelIndex(res);
    });
    app.get('/radio', (req, res) => res.sendFile(radioPageFile));
}

module.exports = { registerPanelHostRoutes };
