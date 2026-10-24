#!/usr/bin/env node
// Operator-only recovery. Run locally in the application container; never expose as HTTP.
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
const email=process.argv[2]?.trim().toLowerCase();
if(!email||!email.includes('@'))throw new Error('Usage: node src/lib/native-auth/recovery-cli.mjs user@example.invalid');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const origin=process.env.NEXT_PUBLIC_APP_URL;
if(!origin||!/^https?:\/\//.test(origin))throw new Error('NEXT_PUBLIC_APP_URL is required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PG_SSL==='false'?false:undefined});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 const user=await client.query('SELECT id FROM auth.users WHERE lower(email)=$1 FOR UPDATE',[email]);
 if(!user.rows[0])throw new Error('Account not found');
 const token=randomBytes(32).toString('base64url');const hash=createHash('sha256').update(token).digest('hex');
 await client.query('UPDATE auth.native_recovery SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL',[user.rows[0].id]);
 await client.query("INSERT INTO auth.native_recovery(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[hash,user.rows[0].id]);
 await client.query('COMMIT');
 const url=new URL('/reset-password',origin);url.hash='recovery_token='+encodeURIComponent(token);
 // Deliberately delivered only to the authorized operator, not a public API response/log.
 process.stdout.write('Single-use recovery link (expires in 15 minutes):\n'+url+'\n');
}catch(e){await client.query('ROLLBACK');throw e}finally{client.release();await pool.end()}
