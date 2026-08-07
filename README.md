# Backup


This is a simple repo to store backups/restoration points of parroquia.app site builder

It mirrors the live site configs from `data.parroquia.app/{slug}/config.json`
(the slug list comes from `data.parroquia.app/slugs.json`) into
`config/{slug}/config.json`. Git history is the backup timeline — each committed
change is a restore point.

## Usage

Run the backup manually:

```sh
npm run backup   # or: node scripts/backup.mjs
```

A GitHub Action (`.github/workflows/backup.yml`) runs the same script daily and
commits any changes automatically. It can also be triggered manually from the
Actions tab (`workflow_dispatch`).

Configs are normalized (stable key ordering + 2-space indent) so diffs stay
minimal and readable.