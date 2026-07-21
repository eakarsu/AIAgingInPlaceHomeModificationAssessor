'use strict';

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

function nonEmpty(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

function actorFrom(user = {}) {
  const nested = user.user || {};
  const id = user.id || user.userId || nested.id;
  if (!id) throw Object.assign(new Error('Authenticated identity is missing an id'), { status: 401 });
  return {
    id: String(id),
    tenantId: String(user.tenantId || user.tenant_id || user.organizationId || nested.tenantId || `user:${id}`),
    role: String(user.role || nested.role || 'operator'),
  };
}

function createPolicy(config) {
  if (!IDENTIFIER.test(config.table)) throw new Error('Unsafe workflow table identifier');
  const statuses = new Set(config.statuses);
  const providers = new Set(config.providers);

  function normalizeEvidence(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => ({
      type: String(item?.type || ''),
      externalId: String(item?.externalId || ''),
      observedAt: item?.observedAt || null,
      checksum: String(item?.checksum || ''),
      authoritative: item?.authoritative === true,
      status: item?.status === 'accepted' ? 'accepted' : 'pending',
    })).filter((item) => item.type && item.externalId);
  }

  function acceptedEvidence(record) {
    return normalizeEvidence(record.evidence).filter((item) => item.authoritative && item.status === 'accepted' && SHA256.test(item.checksum) && item.observedAt && !Number.isNaN(Date.parse(item.observedAt)));
  }

  function evaluate(record) {
    const payload = record.payload || {};
    const evidence = normalizeEvidence(record.evidence);
    const accepted = new Set(acceptedEvidence({ evidence }).map((item) => item.type));
    const missingFields = config.requiredFields.filter((field) => !nonEmpty(payload[field]));
    const missingEvidence = config.requiredEvidence.filter((type) => !accepted.has(type));
    const checks = [{ code: 'MODEL_OUTPUT_ADVISORY_ONLY', passed: payload.modelOutputTrusted !== true }, ...(config.deterministicChecks || []).map((check) => ({ code: check.code, passed: Boolean(check.test(payload)) }))];
    return {
      ready: missingFields.length === 0 && missingEvidence.length === 0 && checks.every((check) => check.passed),
      missingFields,
      missingEvidence,
      checks,
      advisoryOnly: true,
    };
  }

  function authorizeTransition(record, targetStatus, actor, approval) {
    if (!statuses.has(targetStatus)) return { ok: false, code: 'INVALID_STATUS' };
    const allowed = config.transitions[record.status] || [];
    if (!allowed.includes(targetStatus)) return { ok: false, code: 'INVALID_TRANSITION' };
    if (config.approvalStatuses.includes(targetStatus)) {
      const allowedRoles = config.rolesByStatus?.[targetStatus] || config.approverRoles;
      if (!allowedRoles.includes(actor.role)) return { ok: false, code: 'APPROVER_ROLE_REQUIRED' };
      if (typeof approval?.attestation !== 'string' || approval.attestation.trim().length < 10 || approval.attestation.length > 2000 || !Array.isArray(approval?.evidenceIds) || approval.evidenceIds.length === 0) {
        return { ok: false, code: 'ATTESTATION_REQUIRED' };
      }
      if (!evaluate(record).ready) return { ok: false, code: 'READINESS_CHECK_FAILED' };
      const selected = new Set(approval.evidenceIds.map(String));
      if (acceptedEvidence(record).filter((item) => config.requiredEvidence.includes(item.type)).some((item) => !selected.has(item.externalId))) return { ok: false, code: 'APPROVAL_EVIDENCE_MISMATCH' };
    }
    return { ok: true };
  }

  function authorizeEvidence(item, actor) {
    if (!config.requiredEvidence.includes(item.type)) return { ok: false, status: 400, code: 'UNSUPPORTED_EVIDENCE_TYPE' };
    if (item.authoritative && item.status === 'accepted' && (!SHA256.test(item.checksum) || !item.observedAt || Number.isNaN(Date.parse(item.observedAt)))) return { ok: false, status: 400, code: 'INVALID_AUTHORITATIVE_EVIDENCE' };
    if (item.authoritative && item.status === 'accepted' && !config.evidenceRoles.includes(actor.role)) {
      return { ok: false, status: 403, code: 'EVIDENCE_ACCEPTOR_ROLE_REQUIRED' };
    }
    return { ok: true };
  }

  return { actorFrom, evaluate, authorizeTransition, authorizeEvidence, normalizeEvidence, acceptedEvidence, providers, statuses };
}

module.exports = { createPolicy, actorFrom };
