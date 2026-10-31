# @sellekni/shared: the protocol, the scoring and the ranking

Pure TypeScript with no I/O. **This is the contract** ([docs/05](../../docs/05-PROTOCOL-SCORING-RANKING.md)): change it only through the
[protocol guard](../../docs/guidelines/protocol-guard.md).

| File | What it does |
|---|---|
| `dzmsd.ts` | Encode / decode the DZ-MSD packet (`SLK1 …`, ≤ 160 GSM-7 chars), with typed decode errors |
| `crc8.ts`, `gsm7.ts`, `pluscode.ts` | Check code, SMS alphabet and length, Open Location Code |
| `scoring.ts` | Sellekni Severity Index (`nsi-1.0.0`): rules with reasons. Physiology can force R, mechanism alone is capped at O. Weights are **assumptions** |
| `ranking.ts` | Hospital score `0.45·T + 0.35·C + 0.15·L + 0.05·A`, haversine ETA fallback |
| `merge.ts` | Same incident ⇔ same id, or ≤ 300 m and ≤ 10 min. Merged inputs raise confidence |

```bash
pnpm --filter @sellekni/shared test      # unit tests + golden vectors
pnpm vectors                             # regenerate test-vectors/*.json
pnpm crosscheck                          # independent Python decoder agrees with the vectors (runs in CI)
```

`test-vectors/` holds valid/invalid packets, CRC cases, NSI cases and the worked ranking example. The web app, the phone and the Python cross-check all test against these files.
