const path = require('path');
const { registerPanelHostRoutes } = require('../routes/panel_host_routes');

function registerPanelHostSetup({
    app,
    express,
    fs,
    rootDir,
    appPanelBaseUrl
}) {
    const appsDir = path.resolve(rootDir, '..');
    const panelV2Dist = path.join(appsDir, 'panel-v2', 'dist');
    const landingDist = path.join(appsDir, 'landing', 'dist');
    const radioPageFile = path.join(rootDir, 'radio.html');
    const landingHosts = new Set([
        'www.academiaoxigenio.com',
        'academiaoxigenio.com',
        'www.academiaoxigenio.com.br',
        'academiaoxigenio.com.br'
    ]);

    registerPanelHostRoutes({
        app,
        express,
        fs,
        rootDir,
        panelV2Dist,
        landingDist,
        radioPageFile,
        landingHosts,
        appPanelBaseUrl
    });
}

module.exports = { registerPanelHostSetup };
