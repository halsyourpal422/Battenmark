# Security

## Reporting

If you find a vulnerability in this CAD service (path traversal, worker escape, auth bypass, secret leakage), report it privately. Do not file a public GitHub issue with exploit details.

There is no production-ready hosted multi-tenant deployment yet. Treat local `AGENTCAD_API_TOKEN` as a shared secret, not an identity system.

## Scope notes

- The FreeCAD worker is a **separate process**. Do not add `eval_python`, `execute_python`, or arbitrary FreeCAD Python execution. Those tools are denied on every transport.
- Import paths must stay inside the configured workspace (`PATH_DENIED` otherwise).
- The HTTP API defaults to loopback. Binding `0.0.0.0` requires an explicit env flag.
- Preview PNG rendering and JSCAD evaluation run in-process. Do not pass untrusted code into them.
- Environment keys such as `XAI_API_KEY` belong to the host, not this repository. Never commit them.

## Secrets

This tree must not contain live API keys, cookies, or personal filesystem paths. Test tokens such as `secret-token` are fixtures only.
