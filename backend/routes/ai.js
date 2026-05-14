const express = require('express');
const axios = require('axios');
const { body, query: queryValidator, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation Error', errors: errors.array() });
  next();
};

// Robust JSON parser — tries multiple strategies
function parseAIJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) {}
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch (_) {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

const MODEL = 'anthropic/claude-3-5-sonnet-20241022';

const callOpenRouter = async (systemPrompt, userPrompt, model) => {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: model || process.env.OPENROUTER_MODEL || MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );

  const text = response.data.choices[0].message.content;
  const parsed = parseAIJson(text);
  if (!parsed) return { raw_response: text };
  return parsed;
};

// Persist AI result to ai_results table
const persistAIResult = async (userId, homeId, endpoint, result) => {
  try {
    await query(
      `INSERT INTO ai_results (user_id, home_id, endpoint, model, result)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, homeId || null, endpoint, process.env.OPENROUTER_MODEL || MODEL, JSON.stringify(result)]
    );
  } catch (err) {
    console.error('Failed to persist AI result:', err.message);
  }
};

// POST /api/ai/assess-home
router.post(
  '/assess-home',
  authenticateToken,
  [
    body('home_id').isInt({ min: 1 }).withMessage('home_id must be a positive integer'),
    body('resident_age').optional({ nullable: true }).isInt({ min: 1, max: 130 }).withMessage('resident_age must be 1-130'),
    body('mobility_issues').optional().isString().trim().isLength({ max: 500 }),
    body('vision_issues').optional().isString().trim().isLength({ max: 500 }),
    body('balance_issues').optional().isString().trim().isLength({ max: 500 }),
    body('photos_description').optional().isString().trim().isLength({ max: 2000 }),
  ],
  validate,
  async (req, res) => {
    try {
      const { home_id, photos_description, resident_age, mobility_issues, vision_issues, balance_issues } = req.body;

      const homeResult = await query('SELECT * FROM homes WHERE id = $1 AND user_id = $2', [home_id, req.user.id]);
      if (homeResult.rows.length === 0) return res.status(404).json({ error: 'Home not found' });
      const home = homeResult.rows[0];

      // Pull resident profile if exists
      const profileResult = await query(
        'SELECT * FROM resident_profiles WHERE home_id = $1 AND user_id = $2',
        [home_id, req.user.id]
      );
      const profile = profileResult.rows[0];

      const systemPrompt = `You are a certified occupational therapist and home safety expert specializing in aging-in-place assessments.
Analyze the home and resident profile, then provide a comprehensive safety assessment.
Respond ONLY with valid JSON in this exact format:
{
  "safety_score": 65,
  "urgency_level": "medium",
  "room_risks": [
    { "room": "bathroom", "risk_level": "high", "issues": ["no grab bars", "slippery floor"] }
  ],
  "top_priorities": ["Install grab bars in bathroom", "Add handrails to stairs"],
  "overall_assessment": "Brief summary paragraph",
  "immediate_actions": ["Remove loose rugs today", "Install nightlights in hallways"],
  "estimated_modification_count": 7,
  "estimated_total_cost_range": { "min": 2000, "max": 15000 }
}
Assess all rooms: bathroom, bedroom, kitchen, living room, entrance, stairs, garage.
safety_score 0-100 (higher = safer). urgency_level: low/medium/high/critical.`;

      const userPrompt = `Assess this home for aging-in-place safety:

Home Details:
- Address: ${home.address}
- Year Built: ${home.year_built || 'Unknown'}
- Square Footage: ${home.sq_footage || 'Unknown'} sq ft
- Number of Floors: ${home.num_floors || 1}
- Current Accessibility Score: ${home.current_accessibility_score || 0}/100

Resident Profile:
- Age: ${resident_age || profile?.age || 'Not specified'}
- Mobility Issues: ${mobility_issues || profile?.mobility_issues || 'None reported'}
- Vision Issues: ${vision_issues || profile?.vision_issues || 'None reported'}
- Balance Issues: ${balance_issues || profile?.balance_issues || 'None reported'}
- Medical Notes: ${profile?.medical_notes || 'None'}

Home Description / Photos Notes:
${photos_description || 'No additional description provided'}

Provide safety_score (0-100), urgency_level, room_risks for all rooms, top 5 priorities, and immediate actions.`;

      const aiResult = await callOpenRouter(systemPrompt, userPrompt);

      // Create assessment record
      const assessResult = await query(
        `INSERT INTO assessments (home_id, user_id, assessment_type, status, ai_result, safety_score, urgency_level)
         VALUES ($1, $2, 'full', 'completed', $3, $4, $5) RETURNING *`,
        [home_id, req.user.id, JSON.stringify(aiResult), aiResult.safety_score || null, aiResult.urgency_level || null]
      );

      // Update home accessibility score
      if (aiResult.safety_score) {
        await query('UPDATE homes SET current_accessibility_score = $1, updated_at = NOW() WHERE id = $2', [aiResult.safety_score, home_id]);
      }

      // Persist to ai_results
      await persistAIResult(req.user.id, home_id, 'assess-home', aiResult);

      return res.json({
        assessment: assessResult.rows[0],
        safety_score: aiResult.safety_score,
        urgency_level: aiResult.urgency_level,
        room_risks: aiResult.room_risks || [],
        top_priorities: aiResult.top_priorities || [],
        immediate_actions: aiResult.immediate_actions || [],
        overall_assessment: aiResult.overall_assessment || '',
        estimated_modification_count: aiResult.estimated_modification_count,
        estimated_total_cost_range: aiResult.estimated_total_cost_range,
        model_used: process.env.OPENROUTER_MODEL || MODEL,
      });
    } catch (err) {
      if (err.response) {
        return res.status(502).json({ error: 'AI Service Error', message: 'Failed to get AI response', details: err.response.data });
      }
      console.error('Assess home error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// POST /api/ai/recommend-modifications
router.post(
  '/recommend-modifications',
  authenticateToken,
  [body('assessment_id').isInt({ min: 1 }).withMessage('assessment_id must be a positive integer')],
  validate,
  async (req, res) => {
    try {
      const { assessment_id } = req.body;

      const assessResult = await query(
        `SELECT a.*, h.address, h.year_built, h.sq_footage, h.num_floors
         FROM assessments a JOIN homes h ON a.home_id = h.id
         WHERE a.id = $1 AND a.user_id = $2`,
        [assessment_id, req.user.id]
      );
      if (assessResult.rows.length === 0) return res.status(404).json({ error: 'Assessment not found' });
      const assessment = assessResult.rows[0];

      const systemPrompt = `You are a home modification specialist for aging-in-place. Generate specific, actionable home modifications.
Respond ONLY with valid JSON:
{
  "modifications": [
    {
      "room": "bathroom",
      "modification_type": "grab_bars",
      "description": "Install grab bars near toilet and in shower",
      "estimated_cost_min": 200,
      "estimated_cost_max": 600,
      "priority": 1,
      "aging_benefit": "Prevents falls during toilet use and bathing",
      "installation_complexity": "low",
      "ai_reasoning": "Most common cause of home falls in seniors",
      "diy_possible": false,
      "permit_required": false
    }
  ]
}
Include modifications for areas with identified risks. Priority 1-10 (1=most urgent). Costs in USD.
Generate 8-12 specific, targeted modifications based on the actual assessment data.`;

      const userPrompt = `Generate home modification recommendations for this assessment:

Home: ${assessment.address}
Year Built: ${assessment.year_built || 'Unknown'}, Floors: ${assessment.num_floors}, Sq Ft: ${assessment.sq_footage}
Safety Score: ${assessment.safety_score || 'Not scored'}/100
Urgency Level: ${assessment.urgency_level || 'Not specified'}

Assessment Results:
${JSON.stringify(assessment.ai_result, null, 2)}

Generate 8-12 specific modifications with costs, priorities, aging benefits, DIY possibility, and permit requirements.`;

      const aiResult = await callOpenRouter(systemPrompt, userPrompt);
      const modifications = aiResult.modifications || [];

      const savedMods = [];
      for (const mod of modifications) {
        const modResult = await query(
          `INSERT INTO modifications (assessment_id, room, modification_type, description, estimated_cost_min, estimated_cost_max, priority, aging_benefit, ai_reasoning, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'recommended') RETURNING *`,
          [assessment_id, mod.room, mod.modification_type, mod.description,
           mod.estimated_cost_min || null, mod.estimated_cost_max || null,
           mod.priority || 5, mod.aging_benefit || null,
           `${mod.ai_reasoning || ''} | DIY: ${mod.diy_possible ? 'Yes' : 'No'} | Permit: ${mod.permit_required ? 'Required' : 'Not required'}`]
        );
        savedMods.push(modResult.rows[0]);
      }

      await persistAIResult(req.user.id, assessment.home_id, 'recommend-modifications', aiResult);

      return res.json({
        modifications: savedMods,
        count: savedMods.length,
        model_used: process.env.OPENROUTER_MODEL || MODEL,
      });
    } catch (err) {
      if (err.response) {
        return res.status(502).json({ error: 'AI Service Error', message: 'Failed to get AI response', details: err.response.data });
      }
      console.error('Recommend modifications error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// POST /api/ai/estimate-costs
router.post(
  '/estimate-costs',
  authenticateToken,
  [body('modification_id').isInt({ min: 1 }).withMessage('modification_id must be a positive integer')],
  validate,
  async (req, res) => {
    try {
      const { modification_id } = req.body;

      const modResult = await query(
        `SELECT m.*, a.home_id, h.address, h.year_built
         FROM modifications m
         JOIN assessments a ON m.assessment_id = a.id
         JOIN homes h ON a.home_id = h.id
         WHERE m.id = $1 AND a.user_id = $2`,
        [modification_id, req.user.id]
      );
      if (modResult.rows.length === 0) return res.status(404).json({ error: 'Modification not found' });
      const mod = modResult.rows[0];

      const systemPrompt = `You are a licensed contractor specializing in aging-in-place home modifications.
Provide detailed cost estimates for the given modification.
Respond ONLY with valid JSON:
{
  "labor_cost": 500,
  "materials_cost": 300,
  "permits_cost": 150,
  "timeline_days": 2,
  "roi_score": 75,
  "notes": "Detailed notes about the estimate",
  "total_estimated_cost": 950,
  "years_to_payback": 3.5,
  "avoided_costs_explanation": "Prevents $30k hospital bill from a fall",
  "contractor_tips": "Look for CAPS-certified contractors for best quality",
  "diy_savings": 200
}
roi_score is 0-100 (higher = better return on investment).`;

      const userPrompt = `Estimate costs for this home modification:

Modification: ${mod.modification_type}
Room: ${mod.room}
Description: ${mod.description}
Home: ${mod.address}, Year Built: ${mod.year_built || 'Unknown'}
Current Estimate Range: $${mod.estimated_cost_min || 0} - $${mod.estimated_cost_max || 0}
Aging Benefit: ${mod.aging_benefit || 'Not specified'}

Provide detailed cost breakdown including labor, materials, permits, timeline, ROI calculation, and contractor selection tips.`;

      const aiResult = await callOpenRouter(systemPrompt, userPrompt);

      const estResult = await query(
        `INSERT INTO cost_estimates (modification_id, labor_cost, materials_cost, timeline_days, roi_score, notes,
           permits_cost, total_estimated_cost, years_to_payback, avoided_costs_explanation, contractor_tips, diy_savings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [modification_id, aiResult.labor_cost || null, aiResult.materials_cost || null,
         aiResult.timeline_days || null, aiResult.roi_score || null, aiResult.notes || null,
         aiResult.permits_cost || null, aiResult.total_estimated_cost || null,
         aiResult.years_to_payback || null, aiResult.avoided_costs_explanation || null,
         aiResult.contractor_tips || null, aiResult.diy_savings || null]
      );

      await persistAIResult(req.user.id, mod.home_id, 'estimate-costs', aiResult);

      return res.json({
        cost_estimate: estResult.rows[0],
        details: aiResult,
        model_used: process.env.OPENROUTER_MODEL || MODEL,
      });
    } catch (err) {
      if (err.response) {
        return res.status(502).json({ error: 'AI Service Error', message: 'Failed to get AI response', details: err.response.data });
      }
      console.error('Estimate costs error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// POST /api/ai/fall-risk-assessment
router.post(
  '/fall-risk-assessment',
  authenticateToken,
  [
    body('home_id').isInt({ min: 1 }).withMessage('home_id must be a positive integer'),
    body('resident_profile').optional().isObject().withMessage('resident_profile must be an object'),
    body('resident_profile.age').optional().isInt({ min: 1, max: 130 }),
    body('resident_profile.mobility_issues').optional().isString().trim().isLength({ max: 500 }),
    body('resident_profile.vision_issues').optional().isString().trim().isLength({ max: 500 }),
    body('resident_profile.balance_issues').optional().isString().trim().isLength({ max: 500 }),
    body('resident_profile.medications').optional().isString().trim().isLength({ max: 500 }),
    body('resident_profile.fall_history').optional().isString().trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res) => {
    try {
      const { home_id, resident_profile } = req.body;

      const homeResult = await query(
        `SELECT h.*,
           (SELECT ai_result FROM assessments WHERE home_id = h.id ORDER BY created_at DESC LIMIT 1) AS latest_assessment
         FROM homes h WHERE h.id = $1 AND h.user_id = $2`,
        [home_id, req.user.id]
      );
      if (homeResult.rows.length === 0) return res.status(404).json({ error: 'Home not found' });
      const home = homeResult.rows[0];

      // Pull saved resident profile as fallback
      const profileResult = await query(
        'SELECT * FROM resident_profiles WHERE home_id = $1 AND user_id = $2',
        [home_id, req.user.id]
      );
      const savedProfile = profileResult.rows[0];
      const effectiveProfile = { ...savedProfile, ...resident_profile };

      const systemPrompt = `You are a fall prevention specialist and occupational therapist.
Analyze the home and resident profile to predict fall risk and identify hazards.
Respond ONLY with valid JSON:
{
  "fall_risk_score": 72,
  "risk_category": "high",
  "top_hazard_locations": [
    { "location": "bathroom", "hazard": "slippery floor", "risk_contribution": 20, "intervention": "Install non-slip mat and grab bars" }
  ],
  "immediate_interventions": ["Remove loose rugs", "Install nightlights"],
  "risk_factors": ["age over 75", "balance issues", "polypharmacy"],
  "protective_factors": ["single floor", "grab bars in bathroom"],
  "annual_fall_probability": 0.42,
  "five_year_fall_probability": 0.78,
  "estimated_fall_cost": 45000,
  "summary": "Brief risk summary",
  "prevention_roi": "Investing $3,000 in modifications could prevent an average $45,000 fall-related medical cost"
}
fall_risk_score 0-100 (higher = more risk). Provide exactly 5 top hazard locations.`;

      const userPrompt = `Predict fall risk for this home and resident:

Home: ${home.address}
Year Built: ${home.year_built || 'Unknown'}, Floors: ${home.num_floors}
Current Accessibility Score: ${home.current_accessibility_score || 0}/100

Resident Profile:
${JSON.stringify(effectiveProfile, null, 2)}

Latest Assessment Data:
${home.latest_assessment ? JSON.stringify(home.latest_assessment, null, 2) : 'No assessment available'}

Provide fall risk score, top 5 hazard locations with risk contribution percentages, annual and 5-year fall probability, estimated fall cost, and prevention ROI.`;

      const aiResult = await callOpenRouter(systemPrompt, userPrompt);

      // Persist fall risk to database
      const savedResult = await query(
        `INSERT INTO fall_risk_history (home_id, user_id, fall_risk_score, risk_category, annual_fall_probability, five_year_fall_probability, ai_result)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [home_id, req.user.id, aiResult.fall_risk_score || null, aiResult.risk_category || null,
         aiResult.annual_fall_probability || null, aiResult.five_year_fall_probability || null, JSON.stringify(aiResult)]
      );

      await persistAIResult(req.user.id, home_id, 'fall-risk-assessment', aiResult);

      return res.json({
        id: savedResult.rows[0].id,
        fall_risk_score: aiResult.fall_risk_score,
        risk_category: aiResult.risk_category,
        top_hazard_locations: aiResult.top_hazard_locations || [],
        immediate_interventions: aiResult.immediate_interventions || [],
        risk_factors: aiResult.risk_factors || [],
        protective_factors: aiResult.protective_factors || [],
        annual_fall_probability: aiResult.annual_fall_probability,
        five_year_fall_probability: aiResult.five_year_fall_probability,
        estimated_fall_cost: aiResult.estimated_fall_cost,
        prevention_roi: aiResult.prevention_roi,
        summary: aiResult.summary || '',
        created_at: savedResult.rows[0].created_at,
        model_used: process.env.OPENROUTER_MODEL || MODEL,
      });
    } catch (err) {
      if (err.response) {
        return res.status(502).json({ error: 'AI Service Error', message: 'Failed to get AI response', details: err.response.data });
      }
      console.error('Fall risk assessment error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// POST /api/ai/find-grants
router.post(
  '/find-grants',
  authenticateToken,
  [
    body('home_id').isInt({ min: 1 }).withMessage('home_id must be a positive integer'),
    body('state').optional().isString().isLength({ min: 2, max: 50 }).trim(),
    body('zip_code').optional().isString().isLength({ max: 10 }).trim(),
    body('income_level').optional().isIn(['very_low', 'low', 'moderate', 'above_moderate']),
    body('is_veteran').optional().isBoolean(),
    body('is_disabled').optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const { home_id, state, zip_code, income_level, is_veteran, is_disabled } = req.body;

      const homeResult = await query('SELECT * FROM homes WHERE id = $1 AND user_id = $2', [home_id, req.user.id]);
      if (homeResult.rows.length === 0) return res.status(404).json({ error: 'Home not found' });
      const home = homeResult.rows[0];

      const profileResult = await query(
        'SELECT * FROM resident_profiles WHERE home_id = $1 AND user_id = $2',
        [home_id, req.user.id]
      );
      const profile = profileResult.rows[0];

      const systemPrompt = `You are a senior benefits counselor specializing in home modification funding programs.
Identify all available grants, loans, and assistance programs for aging-in-place home modifications.
Respond ONLY with valid JSON:
{
  "grants": [
    {
      "program_name": "HUD Title I Home Improvement Loan",
      "type": "loan",
      "agency": "U.S. Department of Housing and Urban Development",
      "max_amount": 25000,
      "eligibility": "Homeowners with any income level",
      "income_limit": null,
      "application_url": "https://www.hud.gov/program_offices/housing/sfh/title",
      "deadline": "Ongoing",
      "covers": ["accessibility modifications", "general home improvements"],
      "notes": "Low-interest loan, not a grant",
      "match_score": 90
    }
  ],
  "total_potential_funding": 50000,
  "priority_programs": ["Program 1", "Program 2"],
  "next_steps": ["Contact your local Area Agency on Aging", "Gather income documentation"]
}
match_score 0-100 based on eligibility fit. Include federal, state, local, and non-profit programs.`;

      const userPrompt = `Find funding programs for aging-in-place home modifications:

Location: ${home.address}, State: ${state || 'Unknown'}, ZIP: ${zip_code || 'Unknown'}
Resident Age: ${profile?.age || 'Unknown'}
Income Level: ${income_level || 'Not specified'}
Veteran Status: ${is_veteran ? 'Yes' : 'No'}
Disability Status: ${is_disabled ? 'Yes' : 'No'}
Mobility Issues: ${profile?.mobility_issues || 'Not specified'}

Find all applicable federal programs (HUD, USDA, VA, Medicare, Medicaid), state programs, and non-profit grants.
Return programs ranked by match score and total potential funding.`;

      const aiResult = await callOpenRouter(systemPrompt, userPrompt);

      await persistAIResult(req.user.id, home_id, 'find-grants', aiResult);

      return res.json({
        grants: aiResult.grants || [],
        total_potential_funding: aiResult.total_potential_funding,
        priority_programs: aiResult.priority_programs || [],
        next_steps: aiResult.next_steps || [],
        model_used: process.env.OPENROUTER_MODEL || MODEL,
      });
    } catch (err) {
      if (err.response) {
        return res.status(502).json({ error: 'AI Service Error', message: 'Failed to get AI response', details: err.response.data });
      }
      console.error('Find grants error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// POST /api/ai/compliance-report
router.post(
  '/compliance-report',
  authenticateToken,
  [body('assessment_id').isInt({ min: 1 }).withMessage('assessment_id must be a positive integer')],
  validate,
  async (req, res) => {
    try {
      const { assessment_id } = req.body;

      const assessResult = await query(
        `SELECT a.*, h.address, h.year_built, h.sq_footage, h.num_floors
         FROM assessments a JOIN homes h ON a.home_id = h.id
         WHERE a.id = $1 AND a.user_id = $2`,
        [assessment_id, req.user.id]
      );
      if (assessResult.rows.length === 0) return res.status(404).json({ error: 'Assessment not found' });
      const assessment = assessResult.rows[0];

      const systemPrompt = `You are an ADA compliance specialist and aging-in-place consultant.
Evaluate the home against ADA Title III, Fair Housing Amendments Act, and universal design standards.
Respond ONLY with valid JSON:
{
  "overall_compliance_score": 45,
  "compliance_level": "partial",
  "checklist": [
    {
      "requirement": "Accessible Entry",
      "standard": "ADA Title III / FHAA",
      "status": "fail",
      "current_state": "3 steps at main entry, no ramp",
      "required_action": "Install zero-threshold ramp or lift",
      "estimated_cost": 2500,
      "priority": 1
    }
  ],
  "critical_violations": ["No accessible entry", "Bathroom doorway under 32 inches"],
  "compliant_items": ["Single-lever door handles", "Light switches at accessible height"],
  "summary": "The home currently meets 45% of ADA/FHAA standards. Critical violations require immediate attention.",
  "insurance_note": "Addressing critical violations may reduce liability insurance premiums"
}
Evaluate: entries, pathways, bathrooms, kitchens, bedrooms, electrical, lighting, flooring.`;

      const userPrompt = `Evaluate ADA/FHAA compliance for this home:

Home: ${assessment.address}
Year Built: ${assessment.year_built || 'Unknown'}, Floors: ${assessment.num_floors}, Sq Ft: ${assessment.sq_footage}
Safety Score: ${assessment.safety_score || 'Not scored'}/100

Assessment Data:
${JSON.stringify(assessment.ai_result, null, 2)}

Provide comprehensive compliance checklist against ADA Title III, Fair Housing Amendments Act, and universal design standards.`;

      const aiResult = await callOpenRouter(systemPrompt, userPrompt);

      await persistAIResult(req.user.id, assessment.home_id, 'compliance-report', aiResult);

      return res.json({
        overall_compliance_score: aiResult.overall_compliance_score,
        compliance_level: aiResult.compliance_level,
        checklist: aiResult.checklist || [],
        critical_violations: aiResult.critical_violations || [],
        compliant_items: aiResult.compliant_items || [],
        summary: aiResult.summary || '',
        insurance_note: aiResult.insurance_note || '',
        model_used: process.env.OPENROUTER_MODEL || MODEL,
      });
    } catch (err) {
      if (err.response) {
        return res.status(502).json({ error: 'AI Service Error', message: 'Failed to get AI response', details: err.response.data });
      }
      console.error('Compliance report error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// POST /api/ai/budget-optimizer
router.post(
  '/budget-optimizer',
  authenticateToken,
  [
    body('home_id').isInt({ min: 1 }).withMessage('home_id must be a positive integer'),
    body('budget').isInt({ min: 100 }).withMessage('budget must be a positive integer'),
  ],
  validate,
  async (req, res) => {
    try {
      const { home_id, budget } = req.body;

      const homeCheck = await query('SELECT id FROM homes WHERE id = $1 AND user_id = $2', [home_id, req.user.id]);
      if (homeCheck.rows.length === 0) return res.status(404).json({ error: 'Home not found' });

      const modsResult = await query(
        `SELECT m.id, m.modification_type, m.room, m.description, m.priority,
                m.estimated_cost_min, m.estimated_cost_max, m.aging_benefit, ce.roi_score
         FROM modifications m
         JOIN assessments a ON m.assessment_id = a.id
         LEFT JOIN cost_estimates ce ON ce.modification_id = m.id
         WHERE a.home_id = $1 AND a.user_id = $2 AND m.status != 'completed'
         ORDER BY m.priority ASC`,
        [home_id, req.user.id]
      );

      const systemPrompt = `You are a financial advisor specializing in home accessibility improvements.
Given a budget and list of modifications, optimize the selection for maximum safety impact.
Respond ONLY with valid JSON:
{
  "selected_modifications": [1, 3, 5],
  "total_cost_estimate": 4800,
  "total_safety_improvement": 25,
  "optimization_explanation": "Selected modifications address highest-priority fall risks within budget",
  "deferred_modifications": [2, 4],
  "phase_2_cost": 8000,
  "recommendation": "Phase these over 6 months starting with bathroom modifications"
}`;

      const userPrompt = `Optimize home modification selection for a $${budget.toLocaleString()} budget:

Available modifications:
${JSON.stringify(modsResult.rows, null, 2)}

Select modifications that maximize safety improvement within the $${budget.toLocaleString()} budget.
Use the midpoint of cost ranges for estimates. Prioritize by priority score and ROI.`;

      const aiResult = await callOpenRouter(systemPrompt, userPrompt);

      await persistAIResult(req.user.id, home_id, 'budget-optimizer', aiResult);

      const selectedMods = modsResult.rows.filter(m => (aiResult.selected_modifications || []).includes(m.id));
      const deferredMods = modsResult.rows.filter(m => (aiResult.deferred_modifications || []).includes(m.id));

      return res.json({
        budget,
        selected_modifications: selectedMods,
        deferred_modifications: deferredMods,
        total_cost_estimate: aiResult.total_cost_estimate,
        total_safety_improvement: aiResult.total_safety_improvement,
        optimization_explanation: aiResult.optimization_explanation,
        phase_2_cost: aiResult.phase_2_cost,
        recommendation: aiResult.recommendation,
        model_used: process.env.OPENROUTER_MODEL || MODEL,
      });
    } catch (err) {
      if (err.response) {
        return res.status(502).json({ error: 'AI Service Error', message: 'Failed to get AI response', details: err.response.data });
      }
      console.error('Budget optimizer error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// GET /api/ai/modifications/stream?assessmentId=X — SSE with real AI
router.get('/modifications/stream', async (req, res) => {
  const jwt = require('jsonwebtoken');
  const token = req.query.token || req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
  }
  const { assessmentId } = req.query;
  if (!assessmentId || isNaN(parseInt(assessmentId))) {
    return res.status(400).json({ error: 'Valid assessmentId query param required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const assessResult = await query(
      `SELECT a.*, h.address, h.year_built, h.sq_footage, h.num_floors
       FROM assessments a JOIN homes h ON a.home_id = h.id
       WHERE a.id = $1 AND a.user_id = $2`,
      [assessmentId, req.user.id]
    );

    if (assessResult.rows.length === 0) {
      send({ error: 'Assessment not found' });
      return res.end();
    }

    const assessment = assessResult.rows[0];
    send({ type: 'start', message: 'Generating AI-powered modifications...' });

    // Call AI for real modifications
    const systemPrompt = `You are a home modification specialist. Generate specific modifications.
Respond ONLY with valid JSON:
{"modifications": [{"room":"bathroom","modification_type":"grab_bars","description":"Install grab bars near toilet","estimated_cost_min":150,"estimated_cost_max":500,"priority":1,"aging_benefit":"Prevents falls","ai_reasoning":"Highest fall risk area"}]}`;

    const userPrompt = `Generate 8 targeted home modifications for:
Home: ${assessment.address}, ${assessment.num_floors} floors, built ${assessment.year_built || 'unknown'}
Safety Score: ${assessment.safety_score || 'N/A'}/100, Urgency: ${assessment.urgency_level || 'N/A'}
Assessment: ${JSON.stringify(assessment.ai_result || {}, null, 2)}`;

    let aiResult;
    try {
      aiResult = await callOpenRouter(systemPrompt, userPrompt);
    } catch (aiErr) {
      send({ type: 'error', message: 'AI generation failed, using standard recommendations' });
      aiResult = { modifications: [] };
    }

    const modifications = aiResult.modifications || [];
    const savedMods = [];

    for (let i = 0; i < modifications.length; i++) {
      const mod = modifications[i];
      try {
        const modResult = await query(
          `INSERT INTO modifications (assessment_id, room, modification_type, description,
           estimated_cost_min, estimated_cost_max, priority, aging_benefit, ai_reasoning, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'recommended') RETURNING *`,
          [assessmentId, mod.room, mod.modification_type, mod.description,
           mod.estimated_cost_min || null, mod.estimated_cost_max || null,
           mod.priority || (i + 1), mod.aging_benefit || null, mod.ai_reasoning || null]
        );
        if (modResult.rows.length > 0) {
          savedMods.push(modResult.rows[0]);
          send({ type: 'modification', modification: modResult.rows[0], index: savedMods.length });
          await new Promise(r => setTimeout(r, 150));
        }
      } catch (modErr) {
        send({ type: 'error', message: `Failed to save: ${mod.modification_type}` });
      }
    }

    send({ type: 'complete', total: savedMods.length, modifications: savedMods });
  } catch (err) {
    send({ error: err.message });
  }

  res.end();
});

// GET /api/ai/results?home_id=X&endpoint=X&page=1&limit=10
router.get(
  '/results',
  authenticateToken,
  [
    queryValidator('home_id').optional().isInt({ min: 1 }).toInt(),
    queryValidator('endpoint').optional().isString().trim(),
    queryValidator('page').optional().isInt({ min: 1 }).toInt(),
    queryValidator('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  ],
  validate,
  async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const offset = (page - 1) * limit;
    const { home_id, endpoint } = req.query;

    const conditions = ['user_id = $1'];
    const params = [req.user.id];
    let idx = 2;

    if (home_id) { conditions.push(`home_id = $${idx++}`); params.push(home_id); }
    if (endpoint) { conditions.push(`endpoint = $${idx++}`); params.push(endpoint); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    try {
      const countResult = await query(`SELECT COUNT(*) FROM ai_results ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      params.push(limit, offset);
      const result = await query(
        `SELECT id, endpoint, model, created_at, result FROM ai_results ${where}
         ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
        params
      );

      return res.json({
        data: result.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

module.exports = router;
