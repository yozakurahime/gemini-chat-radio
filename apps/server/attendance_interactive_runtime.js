const ATTENDANCE_INTERACTIVE_IDS = Object.freeze({
    entry: 'attendance:entry',
    exit: 'attendance:exit'
});

function normalizeTextForAttendanceInteractive(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w:\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function unwrapInteractiveMessage(message) {
    if (!message || typeof message !== 'object') return {};
    let wrapped = message;
    for (let i = 0; i < 6; i += 1) {
        const next = wrapped?.ephemeralMessage?.message
            || wrapped?.viewOnceMessage?.message
            || wrapped?.viewOnceMessageV2?.message
            || wrapped?.viewOnceMessageV2Extension?.message;
        if (!next || next === wrapped) break;
        wrapped = next;
    }
    return wrapped || {};
}

function commandFromAttendanceInteractiveId(value) {
    const id = normalizeTextForAttendanceInteractive(value);
    if (!id) return null;
    if (id === ATTENDANCE_INTERACTIVE_IDS.entry || id === 'entry' || id === 'entrada' || id === 'registrar entrada') return 'entry';
    if (id === ATTENDANCE_INTERACTIVE_IDS.exit || id === 'exit' || id === 'saida' || id === 'registrar saida') return 'exit';
    return null;
}

function tryParseInteractiveParamsJson(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function extractAttendanceInteractiveCommand(message) {
    const wrapped = unwrapInteractiveMessage(message);
    const candidates = [
        wrapped?.buttonsResponseMessage?.selectedButtonId,
        wrapped?.buttonsResponseMessage?.selectedDisplayText,
        wrapped?.templateButtonReplyMessage?.selectedId,
        wrapped?.templateButtonReplyMessage?.selectedDisplayText,
        wrapped?.listResponseMessage?.singleSelectReply?.selectedRowId,
        wrapped?.listResponseMessage?.title,
        wrapped?.interactiveResponseMessage?.nativeFlowResponseMessage?.name,
        wrapped?.interactiveResponseMessage?.body?.text
    ];

    const params = tryParseInteractiveParamsJson(wrapped?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson);
    if (params && typeof params === 'object') {
        candidates.push(
            params.id,
            params.button_id,
            params.buttonId,
            params.selected_id,
            params.selectedId,
            params.flow_token,
            params.flowToken
        );
    }

    for (const candidate of candidates) {
        const command = commandFromAttendanceInteractiveId(candidate);
        if (command) return command;
    }
    return null;
}

function getAttendanceActionButtonLabel(action) {
    return action === 'exit' ? 'Registrar saida' : 'Registrar entrada';
}

function getAttendanceActionButtonId(action) {
    return action === 'exit' ? ATTENDANCE_INTERACTIVE_IDS.exit : ATTENDANCE_INTERACTIVE_IDS.entry;
}

function buildAttendanceButtonMessageContent(text, action) {
    const normalizedAction = action === 'exit' ? 'exit' : 'entry';
    return {
        buttonsMessage: {
            contentText: String(text || '').trim(),
            footerText: 'Academia Oxigenio',
            buttons: [
                {
                    buttonId: getAttendanceActionButtonId(normalizedAction),
                    buttonText: { displayText: getAttendanceActionButtonLabel(normalizedAction) },
                    type: 1
                }
            ],
            headerType: 1
        }
    };
}

function buildAttendanceNativeFlowMessageContent(text, action) {
    const normalizedAction = action === 'exit' ? 'exit' : 'entry';
    return {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: {
                    body: { text: String(text || '').trim() },
                    footer: { text: 'Academia Oxigenio' },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: 'quick_reply',
                                buttonParamsJson: JSON.stringify({
                                    display_text: getAttendanceActionButtonLabel(normalizedAction),
                                    id: getAttendanceActionButtonId(normalizedAction)
                                })
                            }
                        ]
                    }
                }
            }
        }
    };
}

function createAttendanceActionPromptSender({
    getSock,
    getGenerateWAMessageFromContent,
    logger = console
} = {}) {
    return async function sendAttendanceActionPrompt(targetJid, text, action) {
        const sock = typeof getSock === 'function' ? getSock() : null;
        const generateWAMessageFromContent = typeof getGenerateWAMessageFromContent === 'function'
            ? getGenerateWAMessageFromContent()
            : null;
        const messageText = String(text || '').trim();
        if (!sock || !targetJid || !messageText) return { sent: false, interactive: false };

        const sendTextFallback = async () => {
            await sock.sendMessage(targetJid, { text: messageText });
            return { sent: true, interactive: false, method: 'text' };
        };

        if (generateWAMessageFromContent && typeof sock.relayMessage === 'function') {
            const attempts = [
                ['native_flow', () => buildAttendanceNativeFlowMessageContent(messageText, action)],
                ['buttons_message', () => buildAttendanceButtonMessageContent(messageText, action)]
            ];

            for (const [method, buildContent] of attempts) {
                try {
                    const waMessage = generateWAMessageFromContent(targetJid, buildContent(), {
                        userJid: sock?.user?.id || undefined
                    });
                    await sock.relayMessage(targetJid, waMessage.message, {
                        messageId: waMessage.key?.id
                    });
                    return { sent: true, interactive: true, method };
                } catch (err) {
                    if (logger?.error) logger.error(`[attendance] ${method} prompt fallback:`, err?.message || err);
                }
            }
        }

        return sendTextFallback();
    };
}

module.exports = {
    ATTENDANCE_INTERACTIVE_IDS,
    buildAttendanceButtonMessageContent,
    buildAttendanceNativeFlowMessageContent,
    commandFromAttendanceInteractiveId,
    createAttendanceActionPromptSender,
    extractAttendanceInteractiveCommand,
    getAttendanceActionButtonId,
    getAttendanceActionButtonLabel
};
