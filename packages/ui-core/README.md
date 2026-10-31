# @sellekni/ui-core: display logic shared by web and mobile

No React and no I/O. It holds the parts the two design systems must agree on:

- **Triage markers**: shape + letter + colour per band (R ▲, O ◆, Y ●, G ■, U dashed ○). The shape alone identifies the band, so it still works in greyscale and for colour-blind users ([docs/06](../../docs/06-DESIGN-AND-UX.md)).
- **Packet view**: splits a wire packet into labelled tokens with its GSM-7 length. Validity always comes from the decoder in `@sellekni/shared`.
- Golden-hour ring maths, age formatting, lifecycle steps and the capability vocabulary.

```bash
pnpm --filter @sellekni/ui-core test
```
