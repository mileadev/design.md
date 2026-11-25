# Security deployment and release gates

The hardening branch is not production-approved until CI and adversarial browser tests pass.

Run one replica only. Copy .env.example to .env; set DESIGNMD_ACCESS_TOKEN to a cryptographically random secret (at least 32 characters). Use username designmd and the token as HTTP Basic password. Bind to loopback or configure a trusted TLS reverse proxy and matching DESIGNMD_PUBLIC_ORIGIN. Never publish the egress proxy.

Use the isolated Compose network. Verify container-to-host, DNS, metadata, private and overlay routes are denied independently of application validation; Docker host firewall policy must prohibit proxy access to internal networks, including organization-owned public ranges. Chromium sandbox requires supported user namespaces and seccomp configuration; do not disable it to make deployment work. Supply a reviewed Playwright-compatible seccomp profile where required. No host mounts or service credentials. Set a disk quota on artifact volumes.

HTTPS port 443 only; no URL query credentials, active interaction or automatic third-party fonts. Extraction is best effort. Generated files are untrusted data, not agent instructions. Never run extracted code or grant agent tools based on generated Markdown.

Release gates: frozen-lockfile install, typecheck, lint, unit tests, build, dependency and container vulnerability scan, browser integration tests for redirects, rebinding, private addresses, cross-origin resources, cancellation, XSS, artifact cross-session access, symlinks, quota and storage exhaustion. Inspect actual egress traffic. Rotate the former bypass key if previously used. Pin base images and actions to verified digests/SHAs before production. Rollback: stop the service rather than deploy the vulnerable baseline.
