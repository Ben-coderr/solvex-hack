---
name: najda-protocol
description: Guardrail for the DZ-MSD wire format, CRC-8, NSI scoring and hospital ranking in packages/shared. Use before touching anything that encodes, decodes, scores or ranks, or that parses an incoming SMS.
---

# NAJDA protocol guard

`packages/shared` is the single source of truth: mobile, dashboard and API all import it. Never fork its logic.

1. The wire format is specified in `docs/05-PROTOCOL-SCORING-RANKING.md`. A change to tokens, order, CRC or ranges = a new protocol version (`NAJDA2`), not a silent edit.
2. SMS packets must be pure basic GSM-7 (A-Z 0-9 space `. , + - #`) and <= 160 characters. No Arabic, no accents, no `{}[]~\^|`.
3. After ANY change in `packages/shared`: `pnpm vectors` (regenerate golden vectors), then `pnpm check` (TS tests + typecheck + the independent Python cross-check). All three must pass. Never edit a vector by hand to make a test pass.
4. The server is authoritative: recompute band/score/confidence with `assess()` from the decoded packet. The client's band is a hint, logged for audit only.
5. CRC-8 is an integrity check, not authentication. Never treat a valid CRC as proof of origin. Rate-limit and authenticate the ingress.
6. A packet that fails to parse is stored as an unparsed report and shown raw to the dispatcher. Never drop it.
7. Mechanism-only evidence is capped at band O; physiological criteria (SpO2 < 90, GCS < 13, SBP < 90, unresponsive, breathing, heavy bleeding) can force R. Do not weaken this rule.
