# 06 — Addendum: what makes the look unmistakably NAJDA

1. **The packet is the interface.** The real DZ-MSD text (`SLK1 K7Q2M R75H … #0E`) is always on screen as monospace chips with a live `91/160` counter and a GSM-7 badge; a bad checksum shows up in the chips themselves.
2. **Five shapes before five colours.** R ▲ · O ◆ · Y ● · G ■ · U ◌ dashed and hollow, each carrying its letter. The greyscale test passes, and light themes add a 2 px ink outline.
3. **Triage colours mean bands and nothing else.** Generic states use their own cyan/violet/magenta/blue (≥ 30° of hue from any band, text only, tested in `pnpm check`). SOS, rings and the brand are electric blue, never red.
4. **Night Dispatch surfaces.** Warm graphite by night and warm paper by day, not black and clinical white, with hairline `line` borders doing the work shadows usually do.
5. **One family, two scripts.** IBM Plex Sans Arabic carries Arabic and Latin together, Plex Mono carries the packet, and Bricolage Grotesque carries every number that matters (NSI, ETA, countdown), in Western digits for all three languages.
6. **Honesty is a visual element.** Each estimate brings its confidence bars, top-3 reasons with points and the fixed disclaimer. Each fallback ETA says "estimated", and a ranking explains its rule in one line.
7. **Restrained motion.** There are only two signature motions: a three-pulse arrival on a new marker, and a ring that drains (countdown) or fills (golden hour). Both disappear under reduced motion.
8. **RTL by construction.** Only logical properties are used, so layouts, the lifecycle bar and score bars mirror in Arabic. Packets, numbers and clocks never mirror.
