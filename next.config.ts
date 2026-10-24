import type { NextConfig } from "next";
import { networkInterfaces } from "os";

function getLocalLanOrigins() {
  const hosts = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        hosts.add(entry.address);
      }
    }
  }

  return [...hosts].flatMap((host) => [
    `http://${host}:3000`,
    `http://${host}:3001`,
    `http://${host}:3002`,
    `ws://${host}:3000`,
    `ws://${host}:3001`,
    `ws://${host}:3002`,
  ]);
}

function getLocalLanHosts() {
  const hosts = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        hosts.add(entry.address);
      }
    }
  }

  return [...hosts];
}

const localDevConnectSrc = process.env.NODE_ENV === 'development'
  ? ' ' + [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'ws://localhost:3000',
      'ws://localhost:3001',
      'ws://localhost:3002',
      'ws://127.0.0.1:3000',
      'ws://127.0.0.1:3001',
      'ws://127.0.0.1:3002',
      ...getLocalLanOrigins(),
    ].join(' ')
  : '';

function selfHostedSupabaseConnectSrc() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return '';

  try {
    const url = new URL(value);
    if (url.hostname.endsWith('.supabase.co')) return '';

    const websocketProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return ' ' + url.origin + ' ' + websocketProtocol + '//' + url.host;
  } catch {
    return '';
  }
}

const supabaseConnectSrc = 'https://*.supabase.co wss://*.supabase.co' + selfHostedSupabaseConnectSrc();

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    ...getLocalLanHosts(),
    ...getLocalLanOrigins().map((origin) => origin.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '')),
  ],
  serverExternalPackages: ['@llamaindex/liteparse'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    proxyClientMaxBodySize: '10mb',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; media-src 'self' https://d8j0ntlcm91z4.cloudfront.net; connect-src 'self' ${supabaseConnectSrc}${localDevConnectSrc} https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://www.google.com; frame-ancestors 'none';` },
        ],
      },
    ];
  },
};

export default nextConfig;
