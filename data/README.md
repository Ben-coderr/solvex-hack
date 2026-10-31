# data

| File | What |
|---|---|
| `hospitals.seed.json` | 12 **synthetic** hospitals and their statuses (`HOSPITAL_SET=demo`) |
| `demo-hospitals.json` | Which hospitals the demo logins belong to, plus **synthetic** `+213 555 000 xxx` SMS numbers for the stage hospitals |
| `hospitals.national.json` | 273 Algerian hospitals from OpenStreetMap. Positions are real, services are inferred and **unverified**, and real phone numbers are not used (`HOSPITAL_SET=national`, the default) |
| `snapshots/demo-v1-public.sql.gz` | Demo database snapshot (synthetic incidents only) |
| `traces/` | Real sensor recordings from the Sensor Lab. Synthetic traces live in `packages/detector/traces/` |
