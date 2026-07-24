'use strict';

const express = require('express');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/recommendation', authenticateToken, async (req, res, next) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) return res.status(400).json({ error: 'prompt must contain 1 to 4000 characters' });
    const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
    const model = String(process.env.OPENROUTER_MODEL || '').trim();
    const baseUrl = String(process.env.OPENROUTER_BASE_URL || '').replace(/\/$/, '');
    if (!apiKey || !model || !baseUrl) return res.status(503).json({ error: 'AI provider is not configured' });
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [
        { role: 'system', content: 'Give concise, non-clinical home-accessibility operations guidance. Do not diagnose, prescribe, or automate emergency action; require qualified human review.' },
        { role: 'user', content: prompt },
      ], max_tokens: 180 }),
      signal: AbortSignal.timeout(45000),
    });
    const payload = await upstream.json().catch(() => ({}));
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!upstream.ok || !payload.id || !content) return res.status(502).json({ error: `OpenRouter request failed with HTTP ${upstream.status}` });
    const receipt = (await query(
      `INSERT INTO runtime_ai_provider_receipts(user_id,provider,provider_request_id,model,prompt,content)
       VALUES($1,'openrouter',$2,$3,$4,$5) RETURNING id,provider,provider_request_id,model,created_at`,
      [req.user.id, String(payload.id), String(payload.model || model), prompt, content],
    )).rows[0];
    return res.json({ content, receipt });
  } catch (error) { return next(error); }
});

module.exports = router;
