'use strict';

module.exports = {
  table: 'care_coordination_workflows',
  initialStatus: 'draft',
  statuses: ['draft', 'consent_verified', 'care_review', 'active', 'escalated', 'closed'],
  editableStatuses: ['draft', 'consent_verified'],
  transitions: {
    draft: ['consent_verified', 'closed'], consent_verified: ['draft', 'care_review', 'escalated'],
    care_review: ['consent_verified', 'active', 'escalated'], active: ['escalated', 'closed'],
    escalated: ['care_review', 'closed'], closed: [],
  },
  approvalStatuses: ['active'],
  approverRoles: ['care_professional', 'safeguarding_lead', 'admin'],
  evidenceRoles: ['integration', 'care_professional', 'safeguarding_lead', 'admin'],
  syncRoles: ['integration', 'admin'],
  requiredFields: ['residentReference', 'assessmentReference', 'schedule', 'caregiverRoster', 'escalationRules'],
  requiredEvidence: ['consent', 'assessment', 'caregiver_roster', 'escalation_plan'],
  deterministicChecks: [
    { code: 'CONSENT_CURRENT', test: (p) => p.consentCurrent === true },
    { code: 'EMERGENCY_CONTACT_PRESENT', test: (p) => Boolean(p.emergencyContactReference) },
    { code: 'NO_AUTOMATED_EMERGENCY_ACTION', test: (p) => p.automatedEmergencyAction !== true },
  ],
  providers: ['care_provider', 'calendar', 'messaging', 'emergency_contacts', 'consented_device_feed'],
  providerEnv: {
    care_provider: 'CARE_PROVIDER_API_URL', calendar: 'CALENDAR_API_URL', messaging: 'MESSAGING_API_URL',
    emergency_contacts: 'EMERGENCY_CONTACTS_API_URL', consented_device_feed: 'DEVICE_FEED_API_URL',
  },
};
