function startRuntimeServices({
    startChatMediaCleanupLoop,
    disableWhatsapp,
    server,
    port,
    auditListRoutes,
    startBot
}) {
    startChatMediaCleanupLoop();

    if (disableWhatsapp) {
        if (!server.listening) {
            server.listen(port, () => {
                console.log(`[start] HimeFit Ultimate 6.5: ${port} (whatsapp desativado)`);
                auditListRoutes();
            });
        }
        return;
    }

    startBot();
}

module.exports = { startRuntimeServices };
