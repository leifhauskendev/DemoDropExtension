# DemoDrop Extension

An Opera GX (or Chrome) extension that grabs CS2 demos from **HLTV** and **FACEIT** match pages, unpacks them, and drops the `.dem` files straight into your CS2 folder, ready for `playdemo`.

Companion to [DemoDrop](https://github.com/leifhauskendev/DemoDrop).

## How it works

```
match page ──► browser downloads the demo ─► Downloads\DemoDrop\
                                                   │
                                   native messaging│
                                                   ▼
                            helper (host/host.js): unpack .rar / .zst / .gz
                                                   │
                                                   ▼
                    ...\Counter-Strike Global Offensive\game\csgo\*.dem
```

Browser extensions can only save inside Downloads and can't unpack archives, so a small Node helper does that part. The browser starts it automatically when needed; nothing runs in the background otherwise.

| Site | What you do | What arrives |
|---|---|---|
| HLTV | Click **Send demo to CS2** (added next to "Demo download") or HLTV's own button | `.rar` with one `.dem` per map, named `<tournament>-<team1>-vs-<team2>-m1-<map>.dem` (HLTV's demo name with the tournament in front) |
| FACEIT | Click FACEIT's **Watch demo** in the match room (must be logged in) | `.dem.zst`, renamed to `faceit_<team1>_vs_<team2>_<map>_<id>.dem` |

## Setup (Windows)

Needs Node.js 23.8 or newer (for built-in zstd support).

1. Register the helper:
   ```powershell
   .\install.ps1
   ```
2. In Opera GX go to `opera://extensions` (Chrome: `chrome://extensions`), turn on **Developer mode**, click **Load unpacked** and pick the `extension` folder.
3. Click the DemoDrop icon (in Opera GX it's under the puzzle-piece extensions menu; pin it if you like) to open settings. It should say *Helper connected* and show your CS2 folder.

Re-run `install.ps1` if you move this folder. `uninstall.ps1` removes the registration.

## Settings

- **CS2 demo folder**: empty means auto-detect `game\csgo` from your Steam libraries.
- **Delete archive after unpacking**: on by default.
- **Handle the sites' own download buttons**: on by default; required for FACEIT.

## Troubleshooting

- Helper log: `%LOCALAPPDATA%\DemoDrop\host.log`
- "Specified native messaging host not found": run `install.ps1` again, then reload the extension.
- If something fails, the download stays in `Downloads\DemoDrop`.
