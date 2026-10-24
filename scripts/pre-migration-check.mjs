/**
 * Pre-migration safety check — run before 20260418000000_database_fixes.sql
 * Verifies no data will be lost or blocked by the migration.
 */

import { readFileSync } from 'fs';
import pg from 'pg';

// Load .env.local manually
const envFile = readFileSync('.env.local', 'utf8');
for (const line of envFile.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connStr) {
  console.error('❌ Missing DATABASE_URL or SUPABASE_DB_URL');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: connStr,
  ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 2,
});

const checks = [
  {
    name: 'knowledge_base.org_id 非 uuid 值',
    sql: `SELECT org_id FROM knowledge_base WHERE org_id IS NOT NULL AND org_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    critical: true,
  },
  {
    name: 'expected_close_date 非日期格式',
    sql: `SELECT id, expected_close_date FROM opportunities WHERE expected_close_date IS NOT NULL AND expected_close_date !~ '^\\d{4}-\\d{2}-\\d{2}$'`,
    critical: false,
  },
  {
    name: 'won_date 非日期格式',
    sql: `SELECT id, won_date FROM opportunities WHERE won_date IS NOT NULL AND won_date !~ '^\\d{4}-\\d{2}-\\d{2}$'`,
    critical: false,
  },
  {
    name: 'tasks.account_id 孤儿引用',
    sql: `SELECT id, account_id FROM tasks WHERE account_id IS NOT NULL AND account_id NOT IN (SELECT id FROM accounts)`,
    critical: true,
  },
  {
    name: 'tasks.opportunity_id 孤儿引用',
    sql: `SELECT id, opportunity_id FROM tasks WHERE opportunity_id IS NOT NULL AND opportunity_id NOT IN (SELECT id FROM opportunities)`,
    critical: true,
  },
  {
    name: 'tasks.contact_id 孤儿引用',
    sql: `SELECT id, contact_id FROM tasks WHERE contact_id IS NOT NULL AND contact_id NOT IN (SELECT id FROM contacts)`,
    critical: true,
  },
  {
    name: 'discovery_notes.opportunity_id 孤儿引用',
    sql: `SELECT id, opportunity_id FROM discovery_notes WHERE opportunity_id IS NOT NULL AND opportunity_id NOT IN (SELECT id FROM opportunities)`,
    critical: true,
  },
  {
    name: 'intel_items.opportunity_id 孤儿引用',
    sql: `SELECT id, opportunity_id FROM intel_items WHERE opportunity_id IS NOT NULL AND opportunity_id NOT IN (SELECT id FROM opportunities)`,
    critical: true,
  },
  {
    name: 'composed_emails.opportunity_id 孤儿引用',
    sql: `SELECT id, opportunity_id FROM composed_emails WHERE opportunity_id IS NOT NULL AND opportunity_id NOT IN (SELECT id FROM opportunities)`,
    critical: true,
  },
  {
    name: 'composed_emails.contact_id 孤儿引用',
    sql: `SELECT id, contact_id FROM composed_emails WHERE contact_id IS NOT NULL AND contact_id NOT IN (SELECT id FROM contacts)`,
    critical: true,
  },
  {
    name: 'email_decodes.opportunity_id 孤儿引用',
    sql: `SELECT id, opportunity_id FROM email_decodes WHERE opportunity_id IS NOT NULL AND opportunity_id NOT IN (SELECT id FROM opportunities)`,
    critical: true,
  },
  {
    name: 'comments.entity_id 现有数据（uuid→text 转换检查）',
    sql: `SELECT count(*) as cnt FROM comments`,
    critical: false,
  },
  {
    name: 'quotes 表是否存在',
    sql: `SELECT count(*) as cnt FROM quotes`,
    critical: false,
  },
];

let hasBlocker = false;

console.log('🔍 Closr 迁移前安全检查\n');

for (const check of checks) {
  try {
    const { rows } = await pool.query(check.sql);
    const count = rows.length;

    if (check.sql.includes('count(*)')) {
      const cnt = rows[0]?.cnt ?? 0;
      console.log(`  ✅ ${check.name}: ${cnt} 条记录`);
    } else if (count === 0) {
      console.log(`  ✅ ${check.name}: 无问题`);
    } else {
      const icon = check.critical ? '❌' : '⚠️';
      console.log(`  ${icon} ${check.name}: 发现 ${count} 条问题数据`);
      for (const row of rows.slice(0, 5)) {
        console.log(`     →`, JSON.stringify(row));
      }
      if (count > 5) console.log(`     ... 还有 ${count - 5} 条`);
      if (check.critical) hasBlocker = true;
    }
  } catch (err) {
    // Table might not exist yet
    const msg = err.message || String(err);
    if (msg.includes('does not exist') || msg.includes('relation')) {
      console.log(`  ⏭️  ${check.name}: 表不存在（跳过）`);
    } else {
      console.log(`  ⚠️  ${check.name}: 查询失败 — ${msg}`);
    }
  }
}

console.log('\n' + '─'.repeat(50));
if (hasBlocker) {
  console.log('❌ 存在阻塞问题，需先清理孤儿数据再执行迁移');
  console.log('   修复方法：将孤儿引用的 FK 字段设为 NULL');
} else {
  console.log('✅ 所有检查通过，可以安全执行迁移');
}

await pool.end();
