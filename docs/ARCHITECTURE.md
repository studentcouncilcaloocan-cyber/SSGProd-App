# Migration Architecture — v1

## Current production architecture

Browser
→ Apps Script HTML Service
→ `google.script.run`
→ Apps Script
→ Google Sheets / Drive

## v1 architecture

Browser / GitHub Pages
→ existing frontend
→ compatibility HTTP bridge
→ Apps Script Web App
→ existing Google Sheets / Drive backend

The frontend still calls the same logical backend methods. The bridge only changes the transport from `google.script.run` to HTTP `POST`.

## Why this is the first step

The existing frontend contains the finished application experience:

- Program Flow
- Program Sequence
- live preview
- display/control windows
- timers
- TRT
- MCGI media
- MCGI songs
- lyrics
- Lyric Prompter
- authentication UI
- guide persistence
- live sessions

Rewriting those systems during the hosting migration would add unnecessary risk.

## Later phases

1. Confirm GitHub Pages + Apps Script bridge works.
2. Move static song metadata/search data into GitHub-hosted JSON.
3. Move lyric metadata/search away from repeated Apps Script indexing where appropriate.
4. Reduce Drive/Sheet work performed during user searches.
5. Separate persistent application backend from library indexing.
6. Evaluate a dedicated backend for accounts/guides/live sessions only after the current GitHub version is stable.

The Parent MCGI Music Department Drive remains the source of truth for media/library content.
