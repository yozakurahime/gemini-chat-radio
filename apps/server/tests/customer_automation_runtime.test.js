const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAutomationContext,
  buildTrialRequest,
  classifyIntent,
  isGlobalOptIn,
  isGlobalOptOut,
  parseContextAwareAiReply,
  updateCustomerAutomationState,
} = require('../customer_automation_runtime');

test('classifies commercial and critical intents', () => {
  assert.equal(classifyIntent('Quanto custa o plano anual?').intent, 'plans');
  assert.equal(classifyIntent('Quero marcar uma aula experimental').intent, 'trial');
  assert.equal(classifyIntent('Fizeram uma cobrança indevida').intent, 'payment_issue');
});

test('builds persistent customer memory and sales stage', () => {
  const conversation = {};
  const first = updateCustomerAutomationState(conversation, 'Quero uma aula experimental de pilates');
  assert.equal(first.salesStage, 'trial_interest');
  assert.equal(conversation.customerMemory.modality, 'Pilates');

  updateCustomerAutomationState(conversation, 'Pode ser amanhã às 18h');
  assert.equal(conversation.customerMemory.preferredDay, 'amanhã');
  assert.equal(conversation.customerMemory.preferredTime, '18:00');
  assert.equal(conversation.automationUnknownCount, 0);

  const request = buildTrialRequest({ ...conversation, id: 'contact-1', name: 'Ana' });
  assert.equal(request.status, 'pending_confirmation');
  assert.equal(request.requestedTime, '18:00');
});

test('tracks repeated unknown messages without using them as a handoff rule', () => {
  const conversation = {};
  updateCustomerAutomationState(conversation, 'xyz');
  updateCustomerAutomationState(conversation, 'abc');
  updateCustomerAutomationState(conversation, 'def');
  assert.equal(conversation.automationUnknownCount, 3);
});

test('recognizes the private marker for information missing from context', () => {
  const parsed = parseContextAwareAiReply('[[HUMAN_HANDOFF_CONTEXT_MISSING]]');
  assert.equal(parsed.requiresHuman, true);
  assert.equal(parsed.reply, '');

  const normal = parseContextAwareAiReply('A academia abre as 6h.');
  assert.equal(normal.requiresHuman, false);
  assert.equal(normal.reply, 'A academia abre as 6h.');
});

test('recognizes global opt-out and opt-in', () => {
  assert.equal(isGlobalOptOut('Não quero mais receber mensagens'), true);
  assert.equal(isGlobalOptIn('Quero receber mensagens'), true);
  assert.match(buildAutomationContext({ name: 'Ana', salesStage: 'interested', customerMemory: { objective: 'emagrecimento' } }), /Objetivo: emagrecimento/);
});
