# Hairy Penguins - DECO1800 Team Project

Team project for DECO1800 (Design Computing Studio 1) at The University of Queensland.

## Zone

| | |
|---|---|
| **Web address** | https://deco1800teams-hairy-penguins.uqcloud.net/ |
| **SSH / SFTP host** | `deco1800teams-hairy-penguins.zones.eait.uq.edu.au` |
| **Web root** | `/var/www/htdocs` |
| **Login** | Your UQ username and password |
| **Manage** | https://coursemgr.uqcloud.net/deco1800teams |

The zone is only reachable from the UQ network. Off campus, connect to the
[UQ VPN](https://my.uq.edu.au/information-and-services/information-technology/working-remotely/vpn-virtual-private-network) first.
By default the site sits behind a UQ login (see section 5.4.1 of the Web Project Image Guide to change that).

## Project layout

```
index.html        Entry page
css/style.css     Styles
js/script.js      JavaScript (jQuery is loaded from the CDN in index.html)
images/           Images and other static assets
deploy.sh         Uploads the site to the zone
```

Open `index.html` in a browser to work locally. There is no build step.

## Deploying to the zone

### Option 1: deploy script (Mac / Linux / WSL)

```bash
./deploy.sh your_uq_username
```

Uploads `index.html`, `css/`, `js/` and `images/` to `/var/www/htdocs` with rsync
(falls back to scp). Add new top-level folders to `SITE_FILES` in `deploy.sh`.

### Option 2: VS Code SFTP extension

1. Install the **SFTP** extension (Natizyskunk).
2. Copy `.vscode/sftp.json.example` to `.vscode/sftp.json` and put in your UQ username.
3. Right-click a file or folder and choose **Upload**. `sftp.json` is git-ignored so each teammate keeps their own.

### Option 3: FileZilla

Site Manager > New Site:

- Protocol: **SFTP**
- Host: `deco1800teams-hairy-penguins.zones.eait.uq.edu.au`
- Logon type: Normal, with your UQ username and password
- Advanced > Default remote directory: `/var/www/htdocs`
- Transfer Settings: Passive

## Zone admin cheatsheet

The zone runs Ubuntu 24.04 with nginx (already enabled) and MySQL. The course notes describe
`svcadm`, which is for the older zone image and does not exist here; use `systemctl` instead.

Connect with `ssh your_uq_username@deco1800teams-hairy-penguins.zones.eait.uq.edu.au`
(or `ssh hairy-penguins` if you have the SSH config entry).

| Task | Command |
|---|---|
| Check the web server | `systemctl status nginx` |
| Restart the web server | `sudo systemctl restart nginx` |
| Watch the error log | `sudo tail -f /var/log/nginx/error.log` |
| Access log | `sudo tail /var/log/nginx/access.log` |
| List backups (kept for a week) | `ls /var/www/.zfs/snapshot/` |
| Roll back to a backup | `cp -a /var/www/.zfs/snapshot/<name>/htdocs /var/www/htdocs/` |

`sudo` asks for your UQ password. A blank page after a refresh usually means a server-side
error, so check the nginx error log, not just the browser console.

The UQ login gate is applied by nginx on the zone itself, so `curl` from anywhere gets a 302
to the UQ login page. Check the site in a browser while signed in.

## Team workflow

1. `git pull` before you start.
2. Work on a branch (`git checkout -b feature/your-thing`) and open a pull request into `main`.
3. Deploy from `main` so the zone always matches what is merged.

## Resources

- [UQ Cloud documentation](https://guide.uqcloud.net/) and the Web Project Image Guide
- [Using Fetch to retrieve data from an API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [Working with JSON](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Objects/JSON)
