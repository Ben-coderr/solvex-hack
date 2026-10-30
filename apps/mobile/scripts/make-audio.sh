#!/usr/bin/env bash
# Countdown audio (SYNTHETIC placeholders, replace the voices with a human recording before the pilot):
#   alarm.m4a     two-tone 880/660 Hz beep, 1 s, loops cleanly
#   voice_*.m4a   the countdown question, recorded from macOS TTS (Majed ar, Thomas fr, Samantha en): the
#                 fallback when the phone has no Arabic/French TTS data (docs/03 §6).
set -euo pipefail
cd "$(dirname "$0")/../assets/audio"
T=$(mktemp -d)
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=880:duration=0.25" -f lavfi -i "sine=frequency=660:duration=0.25" \
  -f lavfi -i "anullsrc=r=44100:cl=mono:d=0.5" -filter_complex "[0][1][2]concat=n=3:v=0:a=1,volume=0.9" -ar 44100 -ac 1 -c:a aac -b:a 64k alarm.m4a
say -v Majed -o "$T/ar.aiff" "هل أنت بخير؟ اضغط أنا بخير، وإلا سيُطلَب الإسعاف."
say -v Thomas -o "$T/fr.aiff" "Êtes-vous blessé ? Appuyez sur Ça va, sinon les secours seront prévenus."
say -v Samantha -o "$T/en.aiff" "Are you hurt? Press I am OK, or help will be called."
for l in ar fr en; do ffmpeg -loglevel error -y -i "$T/$l.aiff" -ar 22050 -ac 1 -c:a aac -b:a 48k "voice_$l.m4a"; done
rm -rf "$T"
ls -la
