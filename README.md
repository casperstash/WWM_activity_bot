# Serene Activity Bot

A Discord bot that turns the weekly guild-activity points screenshots into an up-to-date
Google Sheet. Someone posts the screenshots, an officer runs one
command, and the bot reads every member's weekly activity points, writes them into the roster
sheet, color-tiers each member, and posts a short summary back in Discord.

## What it does

- **Reads the screenshots with OCR** — pulls each member's name and weekly activity
  points straight from the images.
- **Matches names to your roster** (read live from the sheet), so odd spellings,
  bullets, and non-Latin names still line up with the right member.
- **Writes a new dated column** into the Google Sheet and **color-tiers** every cell:

  | Weekly points | Tier |
  |---|---|
  | under 1000 | 🔴 **Lurker** |
  | 1000 – 2499 | 🟡 **Developing** |
  | 2500 and up | 🟢 **Pillar** |

- **Posts a plain report** in Discord: the tier counts, who needs a second look, and
  who to add by hand. Screenshots get a ⏳ while it works and a ✅ when it's done.

## It learns as you use it

Every correction sticks, so you only ever fix a name **once**:

- **Approve** a flagged name in the report → that reading is remembered, and the same
  member matches automatically every week after.
- **Add by hand** and link the on-screen name to a member → it fills the value **and**
  learns the name for next time.
- **Deny** a wrong match → it's cleared and forgotten.

Learned names are stored locally next to the bot, keyed by member, so they survive
name changes.

## Commands

**In Discord** — `/scan` (officer-only) does a weekly import:

| Option | What it does |
|---|---|
| `date:` | Column header for the week (defaults to today, e.g. `7/19`) |
| `preview:` | Show the results **without** writing to the sheet |
| `admin:` | Include technical details (screenshots read, cells written) |
| `messages:` | How many recent messages to scan for screenshots |

Buttons on the report: **Double-check names** (approve / deny), **Add by hand**
(fill a missing member), and **Try again** on a failed run.

**`/grade`** (officer-only) sets the point cutoffs and tier names — run it with no
options to see the current scale, or set any of: `lurker_under:`, `developing_under:`,
`lurker_name:`, `developing_name:`, `pillar_name:`. Example:
`/grade lurker_under:1200 developing_under:3000` re-tiers everyone from then on.

## How it works

```
      Screenshots posted in Discord
                  │
                  ▼
        /scan   (an officer runs it)
                  │
                  ▼
        Read each screenshot  (OCR)
                  │
                  ▼
        Match names → guild roster
                  │
                  ▼
   Write points → new weekly column in Google Sheets
                  │
                  ▼
   Color each cell:  🔴 Lurker · 🟡 Developing · 🟢 Pillar
                  │
                  ▼
        Post a summary back in Discord
                  │
                  ▼
   Officer approves / adds by hand ──┐
                  ▲                   │  (bot remembers the fix)
                  └───────────────────┘
             next week's matches get better
```

## What it looks like

<!-- Add screenshots here after the first live run. -->

_Pending first trial run._