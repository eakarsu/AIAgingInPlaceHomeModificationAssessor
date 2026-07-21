'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPolicy, actorFrom } = require('../services/governedWorkflow');
const config = require('../config/careWorkflow');
const policy = createPolicy(config);

const evidence = config.requiredEvidence.map((type, index) => ({
  type, externalId: `source-${index}`, observedAt: '2026-07-18T12:00:00Z',
  checksum: `sha256:${index.toString(16).padStart(64, '0')}`, authoritative: true, status: 'accepted',
}));
const evidenceIds = evidence.map((item) => item.externalId);
const readyRecord = { status: 'care_review', payload: {"residentReference":"opaque-1","assessmentReference":"a-2","schedule":"s-3","caregiverRoster":"r-4","escalationRules":"e-5","consentCurrent":true,"emergencyContactReference":"c-6","automatedEmergencyAction":false}, evidence };

test('incomplete records fail closed with named missing evidence', () => {
  const result = policy.evaluate({ status: config.initialStatus, payload: {}, evidence: [] });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingEvidence, config.requiredEvidence);
  assert.equal(result.advisoryOnly, true);
});

test('authoritative evidence and deterministic checks establish readiness', () => {
  const result = policy.evaluate(readyRecord);
  assert.equal(result.ready, true);
  assert.equal(result.checks.every((check) => check.passed), true);
});

test('ordinary operators cannot approve a governed outcome', () => {
  const decision = policy.authorizeTransition(readyRecord, 'active', { id: '1', role: 'operator' }, { attestation: 'I reviewed the evidence.', evidenceIds: ['source-0'] });
  assert.deepEqual(decision, { ok: false, code: 'APPROVER_ROLE_REQUIRED' });
});

test('provisioned reviewer with attestation can approve a ready record', () => {
  const decision = policy.authorizeTransition(readyRecord, 'active', { id: '2', role: 'care_professional' }, { attestation: 'I reviewed the authoritative evidence.', evidenceIds });
  assert.deepEqual(decision, { ok: true });
});

test('tenant defaults to the authenticated account and cannot be supplied by request data', () => {
  assert.deepEqual(actorFrom({ id: 42, role: 'operator' }), { id: '42', tenantId: 'user:42', role: 'operator' });
});

test('ordinary users cannot self-certify authoritative evidence', () => {
  assert.deepEqual(policy.authorizeEvidence(evidence[0], { id: '1', role: 'operator' }), { ok: false, status: 403, code: 'EVIDENCE_ACCEPTOR_ROLE_REQUIRED' });
});

test('accepted authoritative evidence requires a real SHA-256 digest', () => {
  const decision = policy.authorizeEvidence({ ...evidence[0], checksum: 'not-a-digest' }, { id: '2', role: config.evidenceRoles[0] });
  assert.deepEqual(decision, { ok: false, status: 400, code: 'INVALID_AUTHORITATIVE_EVIDENCE' });
});

test('approval attestation must cite every accepted required source', () => {
  const decision = policy.authorizeTransition(readyRecord, 'active', { id: '2', role: 'care_professional' }, { attestation: 'I reviewed the authoritative evidence.', evidenceIds: ['source-0'] });
  assert.deepEqual(decision, { ok: false, code: 'APPROVAL_EVIDENCE_MISMATCH' });
});

test('only provisioned integration identities may report provider outcomes', () => {
  assert.equal(config.syncRoles.includes('operator'), false);
  assert.equal(config.syncRoles.includes('integration'), true);
});

test('edits are limited to pre-approval workflow states', () => {
  assert.equal(config.editableStatuses.includes(config.initialStatus), true);
  assert.equal(config.editableStatuses.includes('active'), false);
});
