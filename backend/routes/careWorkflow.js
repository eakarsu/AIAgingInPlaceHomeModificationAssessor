'use strict';

const pool = require('../db').pool;
const auth = require('../middleware/auth').authenticateToken;
const config = require('../config/careWorkflow');

module.exports = require('./governedWorkflow')({ db: pool, auth, config });
