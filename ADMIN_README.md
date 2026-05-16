# AELC Website Admin

This adds a local backend and admin panel for the existing static website.

## Start

```bash
npm install
npm start
```

Open:

- Website: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

The first admin visit opens setup. Create your username and password there. After that, the setup page is disabled and the login page protects the admin tools.

## What The Admin Can Do

- Edit any root `.html` website page visually.
- Click text, headings, prices, links, images, videos, and sections directly on the page.
- Change selected text through the side panel without touching HTML.
- Delete or duplicate selected page elements.
- Upload images and videos into category folders under `photos`.
- Filter media by category and insert or replace media from the visual editor.
- See page changes in the editor before saving.
- Automatically create a backup in `backups` before each page save.

## Notes

- Keep your password private.
- The admin data is stored in `data/admin-user.json`.
- The server is designed for local/admin use. If you deploy it publicly, put it behind HTTPS and use a production session store.
