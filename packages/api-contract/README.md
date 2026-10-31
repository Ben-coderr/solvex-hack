# @sellekni/api-contract: JSON schemas between the phone, the pages and the API

[zod](https://zod.dev) schemas and types only ([docs/05 §2](../../docs/05-PROTOCOL-SCORING-RANKING.md)): `IncidentJson` (`POST /api/incidents`),
witness and crew updates, and the server's answer (`outcome`, `incident_id`, `merged_count`, `assessment`).
It maps JSON words to packet letters (`auto → A`, `witness → W`, `sos → M`…). Protocol logic itself lives in [`@sellekni/shared`](../shared).

```bash
pnpm --filter @sellekni/api-contract test
```
