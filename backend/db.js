require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const query = (text, params) => pool.query(text, params);

const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL PRIMARY KEY,
        email        VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name         VARCHAR(255) NOT NULL,
        phone        VARCHAR(50),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS homes (
        id                          SERIAL PRIMARY KEY,
        user_id                     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        address                     TEXT NOT NULL,
        year_built                  INTEGER,
        sq_footage                  INTEGER,
        num_floors                  INTEGER DEFAULT 1,
        current_accessibility_score INTEGER DEFAULT 0,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS resident_profiles (
        id              SERIAL PRIMARY KEY,
        home_id         INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        resident_name   VARCHAR(255),
        age             INTEGER,
        mobility_issues TEXT,
        vision_issues   TEXT,
        balance_issues  TEXT,
        medical_notes   TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(home_id, user_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id              SERIAL PRIMARY KEY,
        home_id         INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assessment_type VARCHAR(50) NOT NULL DEFAULT 'full' CHECK (assessment_type IN ('full','bathroom','kitchen','entrance','bedroom')),
        status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
        ai_result       JSONB,
        safety_score    INTEGER,
        urgency_level   VARCHAR(20) CHECK (urgency_level IN ('low','medium','high','critical')),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS modifications (
        id                  SERIAL PRIMARY KEY,
        assessment_id       INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        room                VARCHAR(100),
        modification_type   VARCHAR(100),
        description         TEXT,
        estimated_cost_min  INTEGER,
        estimated_cost_max  INTEGER,
        priority            INTEGER DEFAULT 5,
        aging_benefit       TEXT,
        ai_reasoning        TEXT,
        status              VARCHAR(20) NOT NULL DEFAULT 'recommended' CHECK (status IN ('recommended','planned','in_progress','completed')),
        contractor_id       INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
        completion_pct      INTEGER DEFAULT 0,
        start_date          DATE,
        end_date            DATE,
        notes               TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contractors (
        id                          SERIAL PRIMARY KEY,
        name                        VARCHAR(255) NOT NULL,
        specialty                   VARCHAR(100),
        license_number              VARCHAR(100),
        phone                       VARCHAR(50),
        email                       VARCHAR(255),
        rating                      DECIMAL(3, 2),
        review_count                INTEGER DEFAULT 0,
        zip_code                    VARCHAR(20),
        is_certified_aging_specialist BOOLEAN DEFAULT FALSE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cost_estimates (
        id              SERIAL PRIMARY KEY,
        modification_id INTEGER NOT NULL REFERENCES modifications(id) ON DELETE CASCADE,
        labor_cost      INTEGER,
        materials_cost  INTEGER,
        timeline_days   INTEGER,
        roi_score       INTEGER,
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_results (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        home_id         INTEGER REFERENCES homes(id) ON DELETE SET NULL,
        endpoint        VARCHAR(100) NOT NULL,
        model           VARCHAR(100),
        prompt_summary  TEXT,
        result          JSONB,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fall_risk_history (
        id                    SERIAL PRIMARY KEY,
        home_id               INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        fall_risk_score       INTEGER,
        risk_category         VARCHAR(20),
        annual_fall_probability DECIMAL(5,4),
        ai_result             JSONB,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotes (
        id              SERIAL PRIMARY KEY,
        modification_id INTEGER NOT NULL REFERENCES modifications(id) ON DELETE CASCADE,
        contractor_id   INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','accepted','rejected')),
        quote_amount    INTEGER,
        notes           TEXT,
        requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        responded_at    TIMESTAMPTZ
      )
    `);

    // Add missing columns to existing tables (safe migrations)
    const alterQueries = [
      `ALTER TABLE homes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
      `ALTER TABLE modifications ADD COLUMN IF NOT EXISTS contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL`,
      `ALTER TABLE modifications ADD COLUMN IF NOT EXISTS completion_pct INTEGER DEFAULT 0`,
      `ALTER TABLE modifications ADD COLUMN IF NOT EXISTS start_date DATE`,
      `ALTER TABLE modifications ADD COLUMN IF NOT EXISTS end_date DATE`,
      `ALTER TABLE modifications ADD COLUMN IF NOT EXISTS notes TEXT`,
      // fall_risk_history — add five_year_fall_probability
      `ALTER TABLE fall_risk_history ADD COLUMN IF NOT EXISTS five_year_fall_probability DECIMAL(5,4)`,
      // cost_estimates — add richer AI fields
      `ALTER TABLE cost_estimates ADD COLUMN IF NOT EXISTS permits_cost INTEGER`,
      `ALTER TABLE cost_estimates ADD COLUMN IF NOT EXISTS total_estimated_cost INTEGER`,
      `ALTER TABLE cost_estimates ADD COLUMN IF NOT EXISTS years_to_payback DECIMAL(6,2)`,
      `ALTER TABLE cost_estimates ADD COLUMN IF NOT EXISTS avoided_costs_explanation TEXT`,
      `ALTER TABLE cost_estimates ADD COLUMN IF NOT EXISTS contractor_tips TEXT`,
      `ALTER TABLE cost_estimates ADD COLUMN IF NOT EXISTS diy_savings INTEGER`,
    ];
    for (const q of alterQueries) {
      try { await pool.query(q); } catch (_) { /* column likely already exists */ }
    }

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
};

module.exports = { query, pool, initDb };
