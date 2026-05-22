# Deploy ChurchOS to GitHub Pages (Free Hosting)

GitHub Pages gives you a free live URL like `https://yourusername.github.io/churchos/`

All data stays in the browser — nothing is stored on GitHub's servers. Completely safe for parish use.

---

## Step 1: Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `churchos` (or whatever you prefer)
3. Make it **Public** (required for free GitHub Pages)
4. Click **Create repository**

---

## Step 2: Push Your Code

In your terminal (in the ChurchOS project folder):

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "ChurchOS v1.0"

# Add your GitHub repo as remote
git remote add origin https://github.com/YOUR_USERNAME/churchos.git

# Push to main
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Step 3: Enable GitHub Pages

1. Go to your repo on GitHub
2. Click **Settings** tab
3. Click **Pages** in the left sidebar
4. Under "Build and deployment":
   - **Source:** Select "GitHub Actions"
5. That's it — the workflow file in `.github/workflows/deploy.yml` handles everything

---

## Step 4: First Deploy

1. Go to **Actions** tab in your repo
2. You should see the "Deploy ChurchOS to GitHub Pages" workflow
3. Click it, then click **Run workflow** → **Run workflow**
4. Wait ~2 minutes for the build to complete
5. Go to **Settings → Pages** to see your live URL

Or just push any change to main — it auto-deploys.

---

## Your Live URL

After deployment, your ChurchOS instance will be at:

```
https://YOUR_USERNAME.github.io/churchos/
```

Bookmark this. Send it to your mom. Access it from any device.

---

## Updating After Changes

Just push to main — GitHub Actions auto-deploys:

```bash
git add .
git commit -m "Your change description"
git push origin main
```

Wait 2 minutes. Refresh the URL. Done.

---

## Custom Domain (Optional)

Want `churchos.yourparish.org` instead?

1. Go to **Settings → Pages**
2. Under "Custom domain", enter your domain
3. Add a DNS `CNAME` record pointing to `YOUR_USERNAME.github.io`
4. GitHub handles HTTPS automatically

---

## What's Already Set Up

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | Auto-builds and deploys on every push |
| `vite.config.ts` | `base: './'` — works with GitHub Pages |
| `HashRouter` | SPA routing that works on any static host |

**You don't need to change any code.** Just push to GitHub and enable Pages.

---

## Security Note

- The app code is public (anyone can see it)
- **Parish data is private** — stored only in the user's browser via localStorage
- Nothing is sent to any server. Nothing is stored on GitHub.
- Each user sees only their own data on their own device

---

*ChurchOS v1.0 — Deployed in 5 minutes, used for decades*
