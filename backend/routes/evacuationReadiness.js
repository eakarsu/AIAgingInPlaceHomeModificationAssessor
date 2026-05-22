const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    feature: 'Evacuation Readiness',
    summary: { readinessScore: 74, blockedExits: 2, caregiverGaps: 1, urgentFixes: 3 },
    zones: [
      { area: 'Front Entry', issue: 'Threshold lip and no exterior handrail', priority: 'High' },
      { area: 'Bedroom Hall', issue: 'Night path lighting below target lux', priority: 'Medium' },
      { area: 'Garage Exit', issue: 'Stored items narrow wheelchair clearance', priority: 'High' },
    ],
    actions: [
      'Clear 36-inch evacuation path from bedroom to primary exit.',
      'Install battery-backed motion lighting along nighttime route.',
      'Add emergency contact placard and caregiver access instructions.',
    ],
  });
});

module.exports = router;
