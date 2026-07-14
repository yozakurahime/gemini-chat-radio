const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyIncomingContactName,
  isPlausiblePersonName,
  lastAssistantAskedForName,
} = require('../contact_name_runtime');

test('detects when the assistant asked for the contact name', () => {
  const history = ['[ts=1770000000000] Hime: Olá! Como posso te chamar?'];
  assert.equal(lastAssistantAskedForName(history), true);
});

test('updates the panel name from a valid chat answer', () => {
  const conversation = {
    name: 'Cliente WhatsApp',
    whatsappName: 'Cliente WhatsApp',
    history: ['[ts=1770000000000] Hime: Qual é o seu nome?'],
  };

  const result = applyIncomingContactName({ conversation, text: 'joão da silva', whatsappName: 'Cliente WhatsApp' });
  assert.equal(result.displayNameChanged, true);
  assert.equal(result.validCandidate, true);
  assert.equal(conversation.name, 'João da Silva');
  assert.equal(conversation.nameSource, 'chat');
});

test('falls back to the WhatsApp name when the answer is not a name', () => {
  const conversation = {
    name: '5511999999999',
    whatsappName: 'Maria WhatsApp',
    history: ['[ts=1770000000000] Hime: Pode me informar seu nome?'],
  };

  const result = applyIncomingContactName({ conversation, text: 'quero saber os planos', whatsappName: 'Maria WhatsApp' });
  assert.equal(result.validCandidate, false);
  assert.equal(conversation.name, 'Maria WhatsApp');
  assert.equal(conversation.nameSource, 'whatsapp');
});

test('accepts an explicit introduction without a previous question', () => {
  const conversation = { name: 'Contato', whatsappName: 'Contato', history: [] };
  applyIncomingContactName({ conversation, text: 'Meu nome é Ana Paula', whatsappName: 'Contato' });
  assert.equal(conversation.name, 'Ana Paula');
  assert.equal(isPlausiblePersonName('quero saber planos'), false);
});
