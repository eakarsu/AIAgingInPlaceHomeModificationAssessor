'use strict';

const express = require('express');
const { createPolicy } = require('../services/governedWorkflow');

module.exports = function createGovernedWorkflowRouter({ db, auth, config }) {
  const router = express.Router();
  const policy = createPolicy(config);
  const table = config.table;
  const auditTable = `${table}_audit`;
  const approvalTable = `${table}_approvals`;
  const syncTable = `${table}_sync_events`;
  router.use(auth);

  const actor = (req) => policy.actorFrom(req.user);
  const fail = (res, status, code, message) => res.status(status).json({ error: code, message });
  const validId = (value) => /^[1-9][0-9]*$/.test(String(value));
  const inTransaction = async (work) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  router.get('/providers', (req, res) => {
    actor(req);
    res.json(config.providers.map((provider) => ({
      provider,
      configured: Boolean(process.env[config.providerEnv[provider]]),
      mode: 'external-adapter-required',
    })));
  });

  router.get('/', async (req, res, next) => {
    try {
      const identity = actor(req);
      const result = await db.query(`SELECT * FROM ${table} WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 200`, [identity.tenantId]);
      res.json(result.rows);
    } catch (error) { next(error); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const identity = actor(req);
      if (!validId(req.params.id)) return fail(res, 400, 'INVALID_ID', 'workflow id must be a positive integer');
      const result = await db.query(`SELECT * FROM ${table} WHERE id=$1 AND tenant_id=$2`, [req.params.id, identity.tenantId]);
      if (!result.rows[0]) return fail(res, 404, 'NOT_FOUND', 'workflow not found');
      res.json({ ...result.rows[0], evaluation: policy.evaluate(result.rows[0]) });
    } catch (error) { next(error); }
  });

  router.get('/:id/history', async (req, res, next) => {
    try {
      const identity = actor(req);
      if (!validId(req.params.id)) return fail(res, 400, 'INVALID_ID', 'workflow id must be a positive integer');
      const owned = await db.query(`SELECT id FROM ${table} WHERE id=$1 AND tenant_id=$2`, [req.params.id, identity.tenantId]);
      if (!owned.rows[0]) return fail(res, 404, 'NOT_FOUND', 'workflow not found');
      const [audit, approvals, syncEvents] = await Promise.all([
        db.query(`SELECT actor_id, actor_role, action, before_state, after_state, created_at FROM ${auditTable} WHERE workflow_id=$1 AND tenant_id=$2 ORDER BY id`, [req.params.id, identity.tenantId]),
        db.query(`SELECT approver_id, approver_role, target_status, workflow_version, attestation, evidence_ids, created_at FROM ${approvalTable} WHERE workflow_id=$1 AND tenant_id=$2 ORDER BY id`, [req.params.id, identity.tenantId]),
        db.query(`SELECT provider, external_id, outcome, error_code, retry_after, created_at FROM ${syncTable} WHERE workflow_id=$1 AND tenant_id=$2 ORDER BY id`, [req.params.id, identity.tenantId]),
      ]);
      res.json({ audit: audit.rows, approvals: approvals.rows, syncEvents: syncEvents.rows });
    } catch (error) { next(error); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const identity = actor(req);
      const title = String(req.body.title || '').trim();
      if (!title) return fail(res, 400, 'TITLE_REQUIRED', 'title is required');
      if (title.length > 250) return fail(res, 400, 'TITLE_TOO_LONG', 'title must be at most 250 characters');
      const payload = req.body.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload) ? req.body.payload : {};
      const evidence = policy.normalizeEvidence(req.body.evidence);
      const evidenceFailure = evidence.map((item) => policy.authorizeEvidence(item, identity)).find((decision) => !decision.ok);
      if (evidenceFailure) return fail(res, evidenceFailure.status || 403, evidenceFailure.code, 'evidence failed schema, provenance, or role validation');
      const idempotencyKey = String(req.get('Idempotency-Key') || req.body.idempotencyKey || '').trim() || null;
      if (idempotencyKey && idempotencyKey.length > 200) return fail(res, 400, 'IDEMPOTENCY_KEY_TOO_LONG', 'idempotency key must be at most 200 characters');
      const item = await inTransaction(async (client) => {
        const result = await client.query(
          `INSERT INTO ${table} (tenant_id, created_by, title, status, payload, evidence, idempotency_key)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
           ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
           DO UPDATE SET title = ${table}.title
           RETURNING *, (xmax = 0) AS inserted`,
          [identity.tenantId, identity.id, title, config.initialStatus, JSON.stringify(payload), JSON.stringify(evidence), idempotencyKey]
        );
        const created = result.rows[0];
        if (created.inserted) await client.query(`INSERT INTO ${auditTable} (workflow_id, tenant_id, actor_id, actor_role, action, after_state) VALUES ($1,$2,$3,$4,'created',$5::jsonb)`, [created.id, identity.tenantId, identity.id, identity.role, JSON.stringify(created)]);
        return created;
      });
      res.status(201).json({ ...item, evaluation: policy.evaluate(item) });
    } catch (error) { next(error); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const identity = actor(req);
      if (!validId(req.params.id)) return fail(res, 400, 'INVALID_ID', 'workflow id must be a positive integer');
      const payloadPatch = req.body.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload) ? req.body.payload : {};
      const requestedTitle = req.body.title === undefined ? null : String(req.body.title).trim();
      if (requestedTitle !== null && (!requestedTitle || requestedTitle.length > 250)) return fail(res, 400, 'INVALID_TITLE', 'title must contain 1 to 250 characters');
      const updated = await inTransaction(async (client) => {
        const found = await client.query(`SELECT * FROM ${table} WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id, identity.tenantId]);
        const item = found.rows[0];
        if (!item) return { error: 'NOT_FOUND' };
        if (Number(req.body.expectedVersion) !== item.version) return { error: 'VERSION_CONFLICT' };
        if (!config.editableStatuses.includes(item.status)) return { error: 'STATE_NOT_EDITABLE' };
        const nextPayload = { ...(item.payload || {}), ...payloadPatch };
        const result = await client.query(
          `UPDATE ${table} SET title=COALESCE($1,title), payload=$2::jsonb, version=version+1, updated_at=NOW() WHERE id=$3 RETURNING *`,
          [requestedTitle, JSON.stringify(nextPayload), item.id]
        );
        await client.query(`INSERT INTO ${auditTable} (workflow_id, tenant_id, actor_id, actor_role, action, before_state, after_state) VALUES ($1,$2,$3,$4,'edited',$5::jsonb,$6::jsonb)`, [item.id, identity.tenantId, identity.id, identity.role, JSON.stringify(item), JSON.stringify(result.rows[0])]);
        return { item: result.rows[0] };
      });
      if (updated.error === 'NOT_FOUND') return fail(res, 404, 'NOT_FOUND', 'workflow not found');
      if (updated.error === 'VERSION_CONFLICT') return fail(res, 409, 'VERSION_CONFLICT', 'reload before editing');
      if (updated.error === 'STATE_NOT_EDITABLE') return fail(res, 422, 'STATE_NOT_EDITABLE', 'return the workflow to an editable state before changing it');
      res.json({ ...updated.item, evaluation: policy.evaluate(updated.item) });
    } catch (error) { next(error); }
  });

  router.post('/:id/evidence', async (req, res, next) => {
    try {
      const identity = actor(req);
      if (!validId(req.params.id)) return fail(res, 400, 'INVALID_ID', 'workflow id must be a positive integer');
      const [evidence] = policy.normalizeEvidence([req.body]);
      if (!evidence) return fail(res, 400, 'INVALID_EVIDENCE', 'type, externalId, checksum, authoritative and status are required');
      const evidenceDecision = policy.authorizeEvidence(evidence, identity);
      if (!evidenceDecision.ok) return fail(res, evidenceDecision.status || 403, evidenceDecision.code, 'evidence failed schema, provenance, or role validation');
      const updated = await inTransaction(async (client) => {
        const found = await client.query(`SELECT * FROM ${table} WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id, identity.tenantId]);
        const item = found.rows[0];
        if (!item) return { error: 'NOT_FOUND' };
        if (Number(req.body.expectedVersion) !== item.version) return { error: 'VERSION_CONFLICT' };
        if (!config.editableStatuses.includes(item.status)) return { error: 'STATE_NOT_EDITABLE' };
        if ((item.evidence || []).some((existing) => String(existing.externalId) === evidence.externalId)) return { error: 'DUPLICATE_EVIDENCE' };
        const result = await client.query(`UPDATE ${table} SET evidence=evidence || $1::jsonb, version=version+1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *`, [JSON.stringify([evidence]), item.id, identity.tenantId]);
        await client.query(`INSERT INTO ${auditTable} (workflow_id, tenant_id, actor_id, actor_role, action, after_state) VALUES ($1,$2,$3,$4,'evidence_added',$5::jsonb)`, [req.params.id, identity.tenantId, identity.id, identity.role, JSON.stringify(evidence)]);
        return { item: result.rows[0] };
      });
      if (updated.error === 'NOT_FOUND') return fail(res, 404, 'NOT_FOUND', 'workflow not found');
      if (updated.error === 'VERSION_CONFLICT') return fail(res, 409, 'VERSION_CONFLICT', 'reload before adding evidence');
      if (updated.error === 'STATE_NOT_EDITABLE') return fail(res, 422, 'STATE_NOT_EDITABLE', 'approved or terminal evidence is immutable');
      if (updated.error === 'DUPLICATE_EVIDENCE') return fail(res, 409, 'DUPLICATE_EVIDENCE', 'external evidence id already exists');
      res.json({ ...updated.item, evaluation: policy.evaluate(updated.item) });
    } catch (error) { next(error); }
  });

  router.post('/:id/sync-events', async (req, res, next) => {
    try {
      const identity = actor(req);
      if (!validId(req.params.id)) return fail(res, 400, 'INVALID_ID', 'workflow id must be a positive integer');
      const provider = String(req.body.provider || '');
      const outcome = String(req.body.outcome || '');
      if (!config.syncRoles.includes(identity.role)) return fail(res, 403, 'INTEGRATION_ROLE_REQUIRED', 'provider sync events require a provisioned integration role');
      if (!policy.providers.has(provider) || !['succeeded', 'failed', 'retrying'].includes(outcome)) {
        return fail(res, 400, 'INVALID_SYNC_EVENT', 'provider and outcome must match the documented adapter contract');
      }
      const externalId = req.body.externalId ? String(req.body.externalId).trim() : null;
      const errorCode = req.body.errorCode ? String(req.body.errorCode).trim() : null;
      const retryAfter = req.body.retryAfter || null;
      if ((externalId && externalId.length > 250) || (errorCode && errorCode.length > 100)) return fail(res, 400, 'INVALID_SYNC_EVENT', 'externalId or errorCode is too long');
      if (outcome === 'succeeded' && !externalId) return fail(res, 400, 'EXTERNAL_ID_REQUIRED', 'successful handoff requires a provider external id');
      if (outcome === 'failed' && !errorCode) return fail(res, 400, 'ERROR_CODE_REQUIRED', 'failed handoff requires a stable error code');
      if (outcome === 'retrying' && (!retryAfter || Number.isNaN(Date.parse(retryAfter)))) return fail(res, 400, 'RETRY_AFTER_REQUIRED', 'retrying handoff requires a valid retryAfter timestamp');
      if (outcome === 'succeeded' && !process.env[config.providerEnv[provider]]) return fail(res, 409, 'PROVIDER_NOT_CONFIGURED', 'cannot record success for an unconfigured provider');
      const event = await inTransaction(async (client) => {
        const owned = await client.query(`SELECT id FROM ${table} WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id, identity.tenantId]);
        if (!owned.rows[0]) return null;
        const inserted = await client.query(`INSERT INTO ${syncTable} (workflow_id, tenant_id, provider, external_id, outcome, error_code, retry_after) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [req.params.id, identity.tenantId, provider, externalId, outcome, errorCode, retryAfter]);
        await client.query(`INSERT INTO ${auditTable} (workflow_id, tenant_id, actor_id, actor_role, action, after_state) VALUES ($1,$2,$3,$4,'provider_sync_recorded',$5::jsonb)`, [req.params.id, identity.tenantId, identity.id, identity.role, JSON.stringify({ provider, outcome, externalId, errorCode, retryAfter })]);
        return inserted.rows[0];
      });
      if (!event) return fail(res, 404, 'NOT_FOUND', 'workflow not found');
      res.status(201).json(event);
    } catch (error) { next(error); }
  });

  router.post('/:id/transition', async (req, res, next) => {
    let client;
    try {
      client = await db.connect();
      const identity = actor(req);
      if (!validId(req.params.id)) return fail(res, 400, 'INVALID_ID', 'workflow id must be a positive integer');
      await client.query('BEGIN');
      const found = await client.query(`SELECT * FROM ${table} WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id, identity.tenantId]);
      const item = found.rows[0];
      if (!item) { await client.query('ROLLBACK'); return fail(res, 404, 'NOT_FOUND', 'workflow not found'); }
      if (Number(req.body.expectedVersion) !== item.version) { await client.query('ROLLBACK'); return fail(res, 409, 'VERSION_CONFLICT', 'reload before transitioning'); }
      const decision = policy.authorizeTransition(item, req.body.targetStatus, identity, req.body.approval);
      if (!decision.ok) {
        await client.query('ROLLBACK');
        const status = decision.code.endsWith('ROLE_REQUIRED') ? 403 : 422;
        return fail(res, status, decision.code, 'transition rejected by deterministic workflow policy');
      }
      const providerRequirement = config.providerRequirementsByStatus?.[req.body.targetStatus];
      if (providerRequirement) {
        const latest = await client.query(`SELECT DISTINCT ON (provider) provider, outcome FROM ${syncTable} WHERE workflow_id=$1 AND tenant_id=$2 ORDER BY provider, created_at DESC, id DESC`, [item.id, identity.tenantId]);
        const succeeded = new Set(latest.rows.filter((row) => row.outcome === 'succeeded').map((row) => row.provider));
        const allSatisfied = (providerRequirement.allOf || []).every((provider) => succeeded.has(provider));
        const anySatisfied = !providerRequirement.anyOf?.length || providerRequirement.anyOf.some((provider) => succeeded.has(provider));
        if (!allSatisfied || !anySatisfied) {
          await client.query('ROLLBACK');
          return fail(res, 422, 'PROVIDER_HANDOFF_REQUIRED', 'a current successful provider handoff is required for this state');
        }
      }
      const separation = config.separationOfDuties?.[req.body.targetStatus];
      if (separation) {
        const prior = await client.query(`SELECT approver_id FROM ${approvalTable} WHERE workflow_id=$1 AND tenant_id=$2 AND target_status=$3 AND workflow_version=$4 ORDER BY id DESC LIMIT 1`, [item.id, identity.tenantId, separation.priorStatus, item.version]);
        if (!prior.rows[0]) {
          await client.query('ROLLBACK');
          return fail(res, 422, 'PRIOR_APPROVAL_REQUIRED', 'a current prior-stage approval is required');
        }
        if (separation.disallowSameActor && String(prior.rows[0].approver_id) === identity.id) {
          await client.query('ROLLBACK');
          return fail(res, 403, 'SEPARATE_APPROVER_REQUIRED', 'the prior approver cannot perform this action');
        }
      }
      const updated = await client.query(`UPDATE ${table} SET status=$1, version=version+1, updated_at=NOW() WHERE id=$2 RETURNING *`, [req.body.targetStatus, item.id]);
      if (config.approvalStatuses.includes(req.body.targetStatus)) {
        await client.query(`INSERT INTO ${approvalTable} (workflow_id, tenant_id, approver_id, approver_role, target_status, workflow_version, attestation, evidence_ids) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [item.id, identity.tenantId, identity.id, identity.role, req.body.targetStatus, updated.rows[0].version, req.body.approval.attestation.trim(), JSON.stringify(req.body.approval.evidenceIds.map(String))]);
      }
      await client.query(`INSERT INTO ${auditTable} (workflow_id, tenant_id, actor_id, actor_role, action, before_state, after_state) VALUES ($1,$2,$3,$4,'transitioned',$5::jsonb,$6::jsonb)`, [item.id, identity.tenantId, identity.id, identity.role, JSON.stringify(item), JSON.stringify(updated.rows[0])]);
      await client.query('COMMIT');
      res.json(updated.rows[0]);
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally { if (client) client.release(); }
  });

  return router;
};
