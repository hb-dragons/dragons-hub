# Hetzner deploy files

Static-site deploy for hbdragons.de on the Hetzner webspace (SFTP-only: no ssh,
no rsync, no symlinks over SFTP — symlinks are created exclusively by
`swap.php`). Consumed by `.github/workflows/deploy-site.yml` (plan task D2).

## Docroot layout

```
/usr/home/hbdrag/
├── .deploy_secret            # outside the docroot; X-Deploy-Token must match
└── public_html/
    ├── .htaccess             # live-traffic switch (staged as .htaccess.new until cutover)
    ├── swap.php              # POST sha=<sha> + X-Deploy-Token header → flips `current`
    ├── releases/<sha>/       # one dir per deploy, pruned to newest 5
    │   └── .htaccess         # ← htaccess-release (testing-host noindex + 404)
    └── current -> releases/<sha>
```

## Files here

| file | uploaded as | when |
|---|---|---|
| `htaccess` | `public_html/.htaccess.new` (renamed `.htaccess` at Phase E go-live) | once (D1) |
| `htaccess-release` | `public_html/releases/<sha>/.htaccess` | every deploy (D2) |
| `swap.php` | `public_html/swap.php` | every deploy (D2, safe to overwrite) |

## One-time host setup (HITL, via SFTP)

1. Generate the swap secret locally: `openssl rand -hex 32`; upload as
   `.deploy_secret` to the SFTP root (`/` in the jail = `/usr/home/hbdrag/`).
   Same value → GH secret `HETZNER_DEPLOY_TOKEN` (task D3).
2. Upload `htaccess` as `public_html/.htaccess.new` — **staged name**; the old
   site keeps serving until Phase E renames it.
3. Upload `swap.php` to `public_html/`.
4. `mkdir public_html/releases`. **Never create `current` by hand** — the first
   `swap.php` call creates it.
5. Isolated swap test (before wiring CI): upload a throwaway
   `releases/0000000/index.html`, then
   `curl -fsS -X POST https://hbdragons.de/swap.php -H "X-Deploy-Token: <secret>" --data sha=0000000`
   → `ok 0000000`; verify `current` exists and old site still serves.

## Testing subdomain (browsable staging pre-cutover)

`site.testing.hbdragons.de` serves the staged release directly — docroot
`public_html/current` (the symlink swap.php maintains next to itself).

Sequencing hazard: the panel may refuse a not-yet-existing docroot, or
pre-create `current/` as a **real directory**, which breaks `swap.php`'s
`rename()`. Order:

1. Run one deploy + swap first (isolated test above, or the D2 workflow) so
   `current` exists as a symlink.
2. In konsoleH create subdomain `site.testing.hbdragons.de`, docroot
   `public_html/current`, Let's Encrypt cert (+ DNS record if not
   auto-created). If the panel already created an empty `current/` directory,
   delete it via SFTP *before* the first swap.
3. Verify:
   - `curl -s https://site.testing.hbdragons.de/` → staged release HTML
   - `curl -sI https://site.testing.hbdragons.de/` → `X-Robots-Tag: noindex, nofollow`
   - the legacy `public_html/.htaccess` doesn't mangle subdomain requests
     (Apache applies parent-dir .htaccess). If it does, wrap its rules in a
     `RewriteCond %{HTTP_HOST}` guard.

Live-host safety: the noindex header is gated on `Host ~ ^site\.testing\.`, and
the new `.htaccess`'s catch-all rewrite is gated on `Host ~ (www\.)?hbdragons\.de`,
so neither file can leak testing behavior onto live traffic.

## Rollback

`workflow_dispatch` deploy-site with input `sha=<previous>` (fast path, no
build), or rename `.htaccess` away to restore the old docroot content.
