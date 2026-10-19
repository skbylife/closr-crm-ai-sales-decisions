# Third-party dependency inventory (source-only preview)

Generated from the exact `package-lock.json`. This source package contains no installed dependencies or native binaries. The table lists locked packages and SPDX metadata, including optional platform packages; it is not a legal opinion or a substitute for license text or attribution required when distributing a particular build. The Community application source uses the custom Closr Community Source-Available License in `LICENSE`; third-party packages retain their own licenses.

Some locked packages omit a license file in the installed package root. Their package metadata declares a license; for the exact release artifact, inspect the publisher's corresponding source and bundled notices before distributing binaries. In particular, `@img/sharp-libvips-darwin-arm64@1.2.4` declares `LGPL-3.0-or-later`; upstream maintains [third-party notices](https://github.com/lovell/sharp-libvips/blob/main/THIRD-PARTY-NOTICES.md) for the bundled native libraries. The `@next/env` and `@next/swc-darwin-arm64` packages declare MIT and point to [Next.js](https://github.com/vercel/next.js/blob/v16.2.6/license.md); `client-only` declares MIT. These source links support review and do not replace exact artifact attribution.

## Bundled installer SQL

The installer includes `schema.sql`, `webhook.sql`, and `_supabase.sql` from
Supabase CLI v2.75.0, licensed under MIT. Copyright (c) 2021 Supabase, Inc.
and contributors. The complete upstream license and exact file hashes are in
`installer/vendor/supabase-cli-2.75.0/LICENSE` and `vendor-manifest.json`.
This bundled source is separate from the 68 npm packages inventoried below.

## Locked npm dependencies

| Package | Version | License | Optional |
|---|---|---|---|
| `@emnapi/runtime` | 1.11.3 | MIT | yes |
| `@img/colour` | 1.1.0 | MIT | yes |
| `@img/sharp-darwin-arm64` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-darwin-x64` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-libvips-darwin-arm64` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-libvips-darwin-x64` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-libvips-linux-arm` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-libvips-linux-arm64` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-libvips-linux-ppc64` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-libvips-linux-riscv64` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-libvips-linux-s390x` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-libvips-linux-x64` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-libvips-linuxmusl-arm64` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-libvips-linuxmusl-x64` | 1.2.4 | LGPL-3.0-or-later | yes |
| `@img/sharp-linux-arm` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-linux-arm64` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-linux-ppc64` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-linux-riscv64` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-linux-s390x` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-linux-x64` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-linuxmusl-arm64` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-linuxmusl-x64` | 0.34.5 | Apache-2.0 | yes |
| `@img/sharp-wasm32` | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | yes |
| `@img/sharp-win32-arm64` | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | yes |
| `@img/sharp-win32-ia32` | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | yes |
| `@img/sharp-win32-x64` | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | yes |
| `@next/env` | 16.2.6 | MIT | no |
| `@next/swc-darwin-arm64` | 16.2.6 | MIT | yes |
| `@next/swc-darwin-x64` | 16.2.6 | MIT | yes |
| `@next/swc-linux-arm64-gnu` | 16.2.6 | MIT | yes |
| `@next/swc-linux-arm64-musl` | 16.2.6 | MIT | yes |
| `@next/swc-linux-x64-gnu` | 16.2.6 | MIT | yes |
| `@next/swc-linux-x64-musl` | 16.2.6 | MIT | yes |
| `@next/swc-win32-arm64-msvc` | 16.2.6 | MIT | yes |
| `@next/swc-win32-x64-msvc` | 16.2.6 | MIT | yes |
| `@supabase/auth-js` | 2.106.2 | MIT | no |
| `@supabase/functions-js` | 2.106.2 | MIT | no |
| `@supabase/phoenix` | 0.4.5 | MIT | no |
| `@supabase/postgrest-js` | 2.106.2 | MIT | no |
| `@supabase/realtime-js` | 2.106.2 | MIT | no |
| `@supabase/ssr` | 0.10.3 | MIT | no |
| `@supabase/storage-js` | 2.106.2 | MIT | no |
| `@supabase/supabase-js` | 2.106.2 | MIT | no |
| `@swc/helpers` | 0.5.15 | Apache-2.0 | no |
| `@types/node` | 20.19.37 | MIT | no |
| `@types/react` | 19.2.14 | MIT | no |
| `@types/react-dom` | 19.2.3 | MIT | no |
| `baseline-browser-mapping` | 2.11.27 | Apache-2.0 | no |
| `caniuse-lite` | 1.0.30001814 | CC-BY-4.0 | no |
| `client-only` | 0.0.1 | MIT | no |
| `cookie` | 1.1.1 | MIT | no |
| `csstype` | 3.2.3 | MIT | no |
| `detect-libc` | 2.1.2 | Apache-2.0 | yes |
| `iceberg-js` | 0.8.1 | MIT | no |
| `nanoid` | 3.3.19 | MIT | no |
| `next` | 16.2.6 | MIT | no |
| `picocolors` | 1.1.1 | ISC | no |
| `postcss` | 8.4.31 | MIT | no |
| `react` | 19.2.4 | MIT | no |
| `react-dom` | 19.2.4 | MIT | no |
| `scheduler` | 0.27.0 | MIT | no |
| `semver` | 7.8.5 | ISC | yes |
| `sharp` | 0.34.5 | Apache-2.0 | yes |
| `source-map-js` | 1.2.2 | BSD-3-Clause | no |
| `styled-jsx` | 5.1.6 | MIT | no |
| `tslib` | 2.8.1 | 0BSD | no |
| `typescript` | 5.9.3 | Apache-2.0 | no |
| `undici-types` | 6.21.0 | MIT | no |
