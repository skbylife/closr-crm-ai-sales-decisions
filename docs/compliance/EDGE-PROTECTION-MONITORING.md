# Edge Protection And Monitoring Controls

## Application Rate Limiting

`src/proxy.ts` applies API request quotas outside development. `src/lib/rate-limit.ts` implements process-local windows, configurable through `RATE_LIMIT_API_WRITE_PER_MINUTE`, `RATE_LIMIT_API_READ_PER_MINUTE`, `RATE_LIMIT_AI_PER_MINUTE` and `RATE_LIMIT_IMPORT_PER_MINUTE`. Native structured queries receive a separate handler write check. Limits return 429 with Retry-After. This is not a distributed limit and resets with the process; production deployments still require edge/WAF controls. Only trust forwarded client addresses from a controlled reverse proxy.

## WAF Baseline

The repository does not install or prove a WAF. Before exposing a deployment, terminate TLS at an operator-managed proxy, restrict backend/DB ports, set upload/body limits, and configure abuse controls appropriate to expected traffic. Preserve trusted Host/protocol headers and strip untrusted forwarding headers. Do not disable application origin checks to accommodate a mismatched public URL. `next.config.ts` supplies browser headers including CSP, HSTS, frame and MIME-sniffing restrictions; CSP currently permits inline/eval scripts and selected external services, so it is not a strict-script CSP guarantee.

## Monitoring Baseline

`/api/health` returns only `{status:"ok"}` publicly. That response proves the handler responds, not database readiness. A matching `x-health-token` for `HEALTH_CHECK_TOKEN` enables database/AI diagnostics; with AI intentionally disabled, AI diagnostics can report degraded status. Do not use that alone to reject a valid no-model installation.

`src/lib/error-monitor.ts` logs structured errors and can send an optional `ERROR_WEBHOOK_URL`. Delivery is best-effort and there is no guarantee of durable alerting. Error messages, stacks and metadata may contain business context: review/redact them before configuring an external destination, restrict log access and retention, and test with synthetic data. No external webhook or monitoring service is configured by the default Compose file.

## Release Gate

Run `npm run verify:production-controls` to check source/document wiring. For the enterprise-like DEPLOY_TARGET values recognized by that script, it additionally requires health/alert settings and explicit WAF/monitoring declarations. These declarations are operator inputs, not independent evidence that external systems work. Do not set confirmation variables simply to turn the gate green. The default private no-model quickstart is distinct from an enterprise public exposure assessment.

Compose forwards only its explicitly listed environment entries. Adding monitoring variables to an env file alone does not enable them; add a reviewed Compose override and keep tokens private if these optional services are needed. No new paid services are required for the private quickstart.

## Non-Claims

No certification, penetration-test result, DDoS resistance, complete error capture, external alert delivery, zero vulnerabilities or production readiness follows from static source checks. Check actual proxy configuration, TLS, backups/restoration, patch status and live tenant isolation before public exposure. All current release-candidate validation must identify its exact commit and distinguish failed, skipped and executed checks.
