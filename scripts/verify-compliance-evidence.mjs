#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const requiredFiles = [
  {
    path: 'docs/compliance/README.md',
    markers: ['# Closr Enterprise Compliance Evidence Packet', 'Customer Review Scope', 'Document Index'],
  },
  {
    path: 'docs/compliance/DPA-SUMMARY.md',
    markers: ['# Data Processing Addendum Summary', 'Controller / Processor Positioning', 'Customer Data'],
  },
  {
    path: 'docs/compliance/SUBPROCESSORS.md',
    markers: ['# Subprocessor Register', 'Current Subprocessors', 'Change Management'],
  },
  {
    path: 'docs/compliance/AI-DATA-PROCESSING-ADDENDUM.md',
    markers: ['# AI Data Processing Addendum', 'Model Providers', 'No Training Commitment'],
  },
  {
    path: 'docs/compliance/AI-PROVIDER-BYOM.md',
    markers: ['# Bring Your Own Model Provider', 'Customer-Owned Provider', 'Capability Matrix', 'Release Gate'],
  },
  {
    path: 'docs/compliance/DATA-RESIDENCY.md',
    markers: ['# Data Residency Statement', 'Deployment Lines', 'Environment Isolation'],
  },
  {
    path: 'docs/compliance/INCIDENT-RESPONSE.md',
    markers: ['# Incident Response Summary', 'Severity Levels', 'Customer Notification'],
  },
  {
    path: 'docs/compliance/RETENTION-SCHEDULE.md',
    markers: ['# Data Retention Schedule', 'Retention Matrix', 'Deletion And Export'],
  },
  {
    path: 'docs/compliance/BACKUP-RESTORE-RECORD.md',
    markers: ['# Backup And Restore Evidence Record', 'Required Evidence', 'Restore Drill Log'],
  },
  {
    path: 'docs/compliance/EVIDENCE-MATRIX.md',
    markers: ['# Enterprise Compliance Evidence Matrix', 'Evidence Matrix', 'Required Before Formal Enterprise Production Use'],
  },
  {
    path: 'docs/compliance/DESTRUCTIVE-ACTION-POLICY.md',
    markers: ['# Destructive Action Policy', 'Current Enforced Controls', 'Release Gate'],
  },
  {
    path: 'docs/compliance/AUDIT-CONTROLS.md',
    markers: ['# Audit Controls', 'Current Enforced Audit Events', 'Release Gate'],
  },
  {
    path: 'docs/compliance/DESTRUCTIVE-ROUTE-CLASSIFICATION.md',
    markers: ['# Destructive Route Classification', 'Current Classification', 'Verification'],
  },
  {
    path: 'docs/compliance/AUTH-ACCESS-CONTROLS.md',
    markers: ['# Authentication And Access Controls', 'Current Auth Audit Coverage', 'Current MFA Posture'],
  },
  {
    path: 'docs/compliance/EDGE-PROTECTION-MONITORING.md',
    markers: ['# Edge Protection And Monitoring Controls', 'Application Rate Limiting', 'WAF Baseline', 'Monitoring Baseline', 'Release Gate'],
  },
  {
    path: 'docs/compliance/ENTERPRISE-GO-LIVE-CHECKLIST.md',
    markers: ['# Enterprise Go-Live Checklist', 'Required Technical Gates', 'Required Customer-Specific Approvals', 'Required Environment Evidence', 'Release Gate'],
  },
];

let failures = 0;

for (const file of requiredFiles) {
  if (!existsSync(file.path)) {
    console.error('FAIL missing ' + file.path);
    failures += 1;
    continue;
  }

  const text = readFileSync(file.path, 'utf8');
  const missingMarkers = file.markers.filter((marker) => !text.includes(marker));
  const unresolved = text.match(/TODO|TBD|\[placeholder\]/i);

  if (missingMarkers.length > 0) {
    console.error('FAIL ' + file.path + ' missing markers: ' + missingMarkers.join(', '));
    failures += 1;
    continue;
  }

  if (unresolved) {
    console.error('FAIL ' + file.path + ' contains unresolved placeholder text: ' + unresolved[0]);
    failures += 1;
    continue;
  }

  console.log('PASS ' + file.path);
}

if (failures > 0) {
  console.error('\nCompliance evidence verification failed: ' + failures + ' issue(s).');
  process.exit(1);
}

console.log('\nCompliance evidence verification passed.');
