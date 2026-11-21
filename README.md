# DemoDrop

**One click on an HLTV or FACEIT match page, and the demos land in your CS2 folder, unpacked and ready for `playdemo`.**

Works in Opera GX, Opera, Chrome, Edge and Brave on Windows.

[![Download DemoDrop](https://img.shields.io/badge/Download-DemoDrop.zip-2563eb?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/leifhauskendev/DemoDropExtension/releases/latest/download/DemoDrop.zip)

---

## Install

### Option A: download and double-click

1. Click **[Download DemoDrop.zip](https://github.com/leifhauskendev/DemoDropExtension/releases/latest/download/DemoDrop.zip)**.
2. Unzip it (right-click → **Extract All**).
3. Double-click **`Install.cmd`**. If Windows shows "Windows protected your PC", click **More info → Run anyway**.

### Option B: one command

Open **PowerShell** (Start menu → type `PowerShell`) and paste:

```powershell
irm https://github.com/leifhauskendev/DemoDropExtension/releases/latest/download/get-demodrop.ps1 | iex
```

### What the installer does for you

- Installs **Node.js** if you don't have it (it powers the small helper that unpacks demos).
- Copies DemoDrop to `%LOCALAPPDATA%\Programs\DemoDrop`, so you can delete the download afterwards.
- Connects the helper to Opera GX, Opera, Chrome, Edge and Brave.
- Finds your CS2 folder automatically.
- Opens your browser's extensions page and copies the extension's folder path for you.

### Last step: add the extension to your browser

Browsers only let *you* add extensions that aren't from their store, so this part is manual. On the extensions page the installer opened:

1. Turn on **Developer mode** (top right).
2. Click **Load unpacked**.
3. Paste the folder path (already copied: `%LOCALAPPDATA%\Programs\DemoDrop\extension`) and click **Select Folder**.

Then click the DemoDrop icon (in Opera GX: the puzzle-piece menu). It should say **Helper connected** and show your CS2 folder.

## Use

| Site | What you do | What you get in `game\csgo` |
|---|---|---|
| **HLTV** | On a match page, click **Send demo to CS2** (or HLTV's own *Demo download*) | One demo per map: `blast-rivals-2026-season-2-g2-vs-falcons-m1-dust2-2026-11-13.dem` |
| **FACEIT** | In a match room, click FACEIT's **Watch demo** (you need to be logged in) | `faceit_<team1>_vs_<team2>_<map>_<match id>_<date>.dem` |

A notification tells you when the demos are ready, including the command to watch them, e.g.

```
playdemo blast-rivals-2026-season-2-g2-vs-falcons-m1-dust2-2026-11-13
```

Downloads go through your browser (so logins and site protections just work) into `Downloads\DemoDrop`, then the helper unpacks them into CS2 and deletes the archive.

## Import FACEIT demos into Refrag

Want to scout a team in [Refrag](https://refrag.gg)'s 2D demo viewer? DemoDrop can upload FACEIT demos to your Refrag account for you. (HLTV demos are already on Refrag, so this is FACEIT only.) You need a Refrag plan with the demo viewer (Prime or Team).

1. Open DemoDrop's settings and click **Sign in to Refrag**, then log in on Refrag's site as usual. DemoDrop uses that login; your password never goes through DemoDrop.
2. Set **Import FACEIT demos into Refrag** to:
   - **Ask me each time**: the "demos ready" pop-up gets an **Import to Refrag** button (or click the pop-up).
   - **Always, automatically**: every FACEIT demo is uploaded right away.
3. When the upload is done, click the pop-up to open the match in Refrag.

If your Refrag login has expired, DemoDrop asks you to sign in again and then finishes the import by itself. Demos already on Refrag aren't uploaded twice.

Note: FACEIT matchmaking demos don't contain team names, so Refrag shows the teams as **team1** and **team2** (team1 is FACEIT's first-listed team). Refrag doesn't allow renaming uploaded demos, so DemoDrop can't change that.

## Settings

Click the DemoDrop icon:

- **CS2 demo folder**: leave empty to use the auto-detected `...\Counter-Strike Global Offensive\game\csgo`.
- **Delete the downloaded archive after unpacking**: on by default.
- **Also handle the sites' own download buttons**: on by default; needed for FACEIT.
- **Refrag**: sign-in status and the import setting described above.

## Update

Run the installer again (Option A or B). Then click **↻ reload** on DemoDrop in your browser's extensions page.

## Uninstall

1. Remove DemoDrop from your browser's extensions page.
2. In PowerShell run:
   ```powershell
   & "$env:LOCALAPPDATA\Programs\DemoDrop\uninstall.ps1"
   ```

## Troubleshooting

- **"Helper not reachable"**: run the installer again, then fully quit your browser (including from the system tray) and reopen it.
- **A demo didn't show up**: it stays in `Downloads\DemoDrop`. The helper's log is at `%LOCALAPPDATA%\DemoDrop\host.log`.
- **"Ask where to save each file" is on** in your browser: you'll get a save dialog for each demo; just click Save.

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

Browser extensions can only save inside Downloads and can't unpack archives, so a small Node helper does that part. The browser starts it only when needed; nothing runs in the background.

## Development

```powershell
git clone https://github.com/leifhauskendev/DemoDropExtension
cd DemoDropExtension
.\install.ps1        # registers the helper from this checkout
```

Load the `extension` folder unpacked. After editing extension files, click reload on the extensions page; helper changes apply to the next download.

To publish a release, bump `version` in `extension/manifest.json` and `host/package.json`, then push a matching tag (`git tag v0.2.0 && git push --tags`). GitHub Actions builds `DemoDrop.zip` and creates the release.

## License

MIT
