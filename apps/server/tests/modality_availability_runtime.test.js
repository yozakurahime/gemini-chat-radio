const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    normalizeAvailabilityPayload,
    buildAvailabilityContext
} = require('../modality_availability_runtime');
const { registerKnowledgeAdminRoutes } = require('../routes/knowledge_admin_routes');

function mockResponse() {
    return {
        statusCode: 200,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; }
    };
}

test('normalizes modality availability and converts zero available spots to full', () => {
    const now = Date.UTC(2026, 6, 14, 12, 0, 0);
    const payload = normalizeAvailabilityPayload({
        entries: [{
            modality: '  Natação infantil  ',
            schedule: 'Ter/Qui às 16:00',
            status: 'available',
            availableSpots: 0,
            validUntil: now + 86400000
        }]
    }, { actor: 'admin', now });

    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].modality, 'Natação infantil');
    assert.equal(payload.entries[0].status, 'full');
    assert.equal(payload.entries[0].updatedBy, 'admin');

    const unspecified = normalizeAvailabilityPayload({
        entries: [{ modality: 'Pilates', status: 'available', availableSpots: null, validUntil: now + 86400000 }]
    }, { actor: 'admin', now });
    assert.equal(unspecified.entries[0].availableSpots, null);
    assert.equal(unspecified.entries[0].status, 'available');
});

test('availability context includes valid entries and ignores expired ones', () => {
    const now = Date.UTC(2026, 6, 14, 12, 0, 0);
    const context = buildAvailabilityContext({
        entries: [
            {
                modality: 'Natação infantil',
                className: '7 a 14 anos',
                schedule: 'Ter/Qui às 16:00',
                status: 'available',
                availableSpots: 1,
                active: true,
                validUntil: now + 86400000
            },
            {
                modality: 'Pilates',
                status: 'available',
                availableSpots: 2,
                active: true,
                validUntil: now - 1
            }
        ]
    }, { now });

    assert.match(context, /Natação infantil/);
    assert.match(context, /1 vaga disponivel/);
    assert.doesNotMatch(context, /Pilates/);
    assert.match(context, /nao significa reserva confirmada/i);
});

test('availability context tells the AI to confirm when there are no current records', () => {
    const context = buildAvailabilityContext({ entries: [] }, { now: Date.now() });
    assert.match(context, /Nao ha registros de vagas ativos e validos/);
    assert.match(context, /recepcao precisa confirmar/);
});

test('knowledge availability endpoints persist and return modality entries', () => {
    const handlers = new Map();
    const app = {
        get(route, handler) { handlers.set(`GET ${route}`, handler); },
        post(route, handler) { handlers.set(`POST ${route}`, handler); }
    };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'himefit-vagas-'));
    const knowledgeDir = path.join(root, 'knowledge');
    const baseContextFile = path.join(root, 'contexto.txt');
    fs.writeFileSync(baseContextFile, 'contexto de teste', 'utf8');
    registerKnowledgeAdminRoutes({
        app,
        db: { prepare: () => ({ all: () => [], run: () => ({}), get: () => null }) },
        fs,
        knowledgeDir,
        baseContextFile,
        requirePanelAuth: () => ({ username: 'admin' }),
        requireAdmin: () => ({ username: 'admin' }),
        getKnowledgePublished: () => ({}),
        setKnowledgePublished: () => {},
        getBaseContext: () => 'contexto de teste',
        getAIContextSnapshot: () => ({}),
        setBaseContext: () => {},
        syncAttendanceClassTemplatesFromContext: () => null,
        broadcast: () => {}
    });

    const saveRes = mockResponse();
    handlers.get('POST /admin/knowledge/availability/save')({
        body: { availability: { entries: [{ modality: 'Natação adulto', availableSpots: 2, validUntil: Date.now() + 86400000 }] } }
    }, saveRes);
    assert.equal(saveRes.statusCode, 200);
    assert.equal(saveRes.payload.availability.entries[0].availableSpots, 2);

    const getRes = mockResponse();
    handlers.get('GET /admin/knowledge/availability')({}, getRes);
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.payload.availability.entries[0].modality, 'Natação adulto');
});
