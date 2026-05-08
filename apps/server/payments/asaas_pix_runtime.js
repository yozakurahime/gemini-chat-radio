const DEFAULT_PIX_EXPIRES_HOURS = 24;

function cleanText(value, max = 200) {
    return String(value || '')
        .replace(/\u0000/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function sanitizePhoneDigits(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 13);
}

function centsToAmount(valueCents) {
    const cents = Number(valueCents || 0);
    if (!Number.isFinite(cents) || cents <= 0) return 0;
    return Math.round(cents) / 100;
}

function asaasStatusToInternal(status) {
    const normalized = String(status || '').toUpperCase().trim();
    if (['RECEIVED', 'RECEIVED_IN_CASH', 'CONFIRMED'].includes(normalized)) return 'paid';
    if (['OVERDUE'].includes(normalized)) return 'overdue';
    if (['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'DELETED'].includes(normalized)) return 'cancelled';
    return 'pending';
}

function formatDateYYYYMMDD(ts) {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function resolveAsaasConfig(env = process.env) {
    const mode = String(env.ASAAS_ENV || 'production').toLowerCase().trim() === 'sandbox' ? 'sandbox' : 'production';
    const apiKey = String(env.ASAAS_API_KEY || '').trim();
    const webhookToken = String(env.ASAAS_WEBHOOK_TOKEN || '').trim();
    const expiresRaw = Number(env.PIX_EXPIRES_HOURS || DEFAULT_PIX_EXPIRES_HOURS);
    const pixExpiresHours = Number.isFinite(expiresRaw) && expiresRaw > 0 ? Math.max(1, Math.min(168, Math.floor(expiresRaw))) : DEFAULT_PIX_EXPIRES_HOURS;
    const defaultBase = mode === 'sandbox' ? 'https://api-sandbox.asaas.com' : 'https://api.asaas.com';
    const baseUrl = String(env.ASAAS_BASE_URL || defaultBase).trim().replace(/\/+$/, '');
    return {
        mode,
        apiKey,
        webhookToken,
        pixExpiresHours,
        baseUrl,
        enabled: !!apiKey
    };
}

async function requestAsaas(config, pathname, { method = 'GET', body, timeoutMs = 15000 } = {}) {
    if (!config?.enabled || !config?.apiKey) {
        const err = new Error('asaas_not_configured');
        err.code = 'asaas_not_configured';
        throw err;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers = {
            'Content-Type': 'application/json',
            access_token: config.apiKey
        };
        const res = await fetch(`${config.baseUrl}${pathname}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
        const text = await res.text();
        let payload = {};
        try {
            payload = text ? JSON.parse(text) : {};
        } catch (_) {
            payload = { raw: text };
        }
        if (!res.ok) {
            const err = new Error('asaas_request_failed');
            err.code = 'asaas_request_failed';
            err.status = res.status;
            err.payload = payload;
            throw err;
        }
        return payload;
    } catch (error) {
        if (error?.name === 'AbortError') {
            const err = new Error('asaas_timeout');
            err.code = 'asaas_timeout';
            throw err;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function createOrReuseAsaasCustomer(config, {
    studentFullName,
    contactId,
    contactPhoneDigits
}) {
    const name = cleanText(studentFullName, 120) || 'Aluno';
    const externalReference = cleanText(contactId, 120);
    const mobilePhone = sanitizePhoneDigits(contactPhoneDigits);
    return requestAsaas(config, '/v3/customers', {
        method: 'POST',
        body: {
            name,
            mobilePhone: mobilePhone || undefined,
            externalReference: externalReference || undefined
        }
    });
}

async function createPixCharge(config, {
    customerId,
    amountCents,
    description,
    externalReference,
    dueDateTs
}) {
    const dueTs = Number(dueDateTs || 0);
    const dueDate = formatDateYYYYMMDD(dueTs > 0 ? dueTs : Date.now() + (config.pixExpiresHours * 3600 * 1000));
    const value = centsToAmount(amountCents);
    if (!value) {
        const err = new Error('invalid_amount');
        err.code = 'invalid_amount';
        throw err;
    }
    return requestAsaas(config, '/v3/payments', {
        method: 'POST',
        body: {
            customer: customerId,
            billingType: 'PIX',
            value,
            dueDate,
            description: cleanText(description, 200),
            externalReference: cleanText(externalReference, 120)
        }
    });
}

async function fetchPixQrCode(config, paymentId) {
    const safePaymentId = cleanText(paymentId, 120);
    if (!safePaymentId) {
        const err = new Error('invalid_payment_id');
        err.code = 'invalid_payment_id';
        throw err;
    }
    return requestAsaas(config, `/v3/payments/${encodeURIComponent(safePaymentId)}/pixQrCode`, {
        method: 'GET'
    });
}

async function fetchPayment(config, paymentId) {
    const safePaymentId = cleanText(paymentId, 120);
    if (!safePaymentId) {
        const err = new Error('invalid_payment_id');
        err.code = 'invalid_payment_id';
        throw err;
    }
    return requestAsaas(config, `/v3/payments/${encodeURIComponent(safePaymentId)}`, {
        method: 'GET'
    });
}

function verifyAsaasWebhookToken(headers, expectedToken) {
    const expected = String(expectedToken || '').trim();
    if (!expected) return true;
    const h = headers || {};
    const received = String(
        h['asaas-access-token']
        || h['asaas_access_token']
        || h['x-asaas-access-token']
        || ''
    ).trim();
    return !!received && received === expected;
}

function extractWebhookPaymentId(payload) {
    const evt = payload && typeof payload === 'object' ? payload : {};
    const payment = evt?.payment && typeof evt.payment === 'object' ? evt.payment : {};
    return cleanText(payment.id || evt.paymentId || '', 120);
}

function extractWebhookStatus(payload) {
    const evt = payload && typeof payload === 'object' ? payload : {};
    const payment = evt?.payment && typeof evt.payment === 'object' ? evt.payment : {};
    return String(payment.status || evt.status || '').toUpperCase().trim();
}

module.exports = {
    DEFAULT_PIX_EXPIRES_HOURS,
    asaasStatusToInternal,
    cleanText,
    createOrReuseAsaasCustomer,
    createPixCharge,
    extractWebhookPaymentId,
    extractWebhookStatus,
    fetchPayment,
    fetchPixQrCode,
    formatDateYYYYMMDD,
    resolveAsaasConfig,
    sanitizePhoneDigits,
    verifyAsaasWebhookToken
};
