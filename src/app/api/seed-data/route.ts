import { NextResponse } from 'next/server';
// Original route mixed account creation with bundled customer-like demo records.
// This distribution starts empty; use normal authenticated CRM import instead.
export async function POST() { return NextResponse.json({ error: 'Bundled demo seeding is not included in this source distribution.' }, { status: 410 }); }
