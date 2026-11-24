# Shipyard: learn DevOps, one container at a time

**A DevOps learning website by Tejus Sanly**

Shipyard is a multi-page website that teaches the core DevOps topics. Every topic you finish loads a container onto your cargo ship.

## Pages

- **Home** (`index.html`): your XP, day streak, % complete and topics loaded, the cargo ship, cards for all 10 topics, and how the site works.
- **Roadmap** (`roadmap.html`): an interactive DevOps roadmap drawn with **React Flow**. Arrows show what each topic needs first. Click a topic to open its page.
- **Topic pages** (`topics/*.html`): one page per topic, each with:
  - a short lesson and key points
  - a practice terminal: a simulated Linux machine where you type real commands and get realistic output
  - a 3-question quiz. Get 3/3 to load the container, earn 100 XP and unlock the next topics.

Topics: Linux · Networking · Git · Scripting · CI/CD · Docker · Cloud (AWS) · Kubernetes · Infrastructure as Code (Terraform) · Monitoring

Progress is saved in your browser (localStorage), and the XP and streak counters are in the navbar on every page. A new visitor starts at 7 of 10 topics done, 700 XP and a 12-day streak (see `START` at the top of `site.js`). **Reset progress** in the footer sets everything to zero.

## Files

```
index.html                 home page
roadmap.html               React Flow roadmap page
topics/                    one HTML page per topic (10 pages)
style.css                  all styling
site.js                    XP, streak, counters, ship, quizzes, and the terminal on each page
terminal.js                the simulated shell behind the practice terminals
roadmap.js                 the React Flow diagram
data.js                    quiz questions, suggested commands and roadmap layout
Dockerfile                 optional: run the site in a container
.github/workflows/ci.yml   optional: CI that checks the code and builds the Docker image
```

## The practice terminal

Every topic page has a terminal you can type into. It's a simulated Linux machine written in JavaScript (`terminal.js`), so it runs entirely in the browser and nothing touches a real computer. It resets when you reload the page.

- **Shell features:** files and folders, pipes `|`, redirects `>` `>>`, `&&` `||` `;`, variables (`NAME=x`, `$NAME`, `$?`), `$(command)`, globs `*`, `for` loops, `if` statements, running `./scripts.sh` (needs `chmod +x` first), ↑/↓ history and Tab completion.
- **Linux:** `ls cd cat echo mkdir rm cp mv grep sed jq find chmod ps kill systemctl journalctl df free apt crontab` and more.
- **Networking:** `ping curl dig nslookup ss ip traceroute`.
- **Git:** a real working model of commits, the staging area, branches, merges, diffs, stash and push.
- **CI/CD:** `npm install/test/build` and `gh run list/view`. Pushing triggers a CI run, and it fails if a test breaks.
- **Docker:** build images from the Dockerfile, run containers with port mapping (then `curl localhost:8080`), and use `ps`, `logs`, `exec`, `stop`, `rm` and `push`.
- **AWS:** S3 buckets and objects, EC2 instances.
- **Kubernetes:** pods, deployments, services, scaling, self-healing (delete a pod and a new one appears), `apply -f`, rollouts and rollbacks.
- **Terraform:** `init`, `plan`, `apply` and `destroy` read the real `main.tf`. The resources appear in `aws s3 ls`, and `sed -i` edits show up as in-place updates.
- **Monitoring:** Prometheus queries and alerts with `curl`, `kubectl top`, logs and Grafana health.

## Tech

| Part | What it uses |
| --- | --- |
| Pages | Plain HTML + CSS |
| Interactivity | Vanilla JavaScript (ES modules) |
| Roadmap diagram | React 19 + React Flow (`@xyflow/react` v12), loaded from a CDN, no build step |
| Hosting | GitHub Pages |
| DevOps extras | Dockerfile (nginx) + GitHub Actions CI |

## Put it on GitHub Pages

1. Create a new **public** repository on GitHub, e.g. `shipyard`.
2. Add the files:
   - **Upload (easiest):** unzip the project, click **Add file → Upload files**, and drag everything in, including the `topics` folder.
   - **Paste:** click **Add file → Create new file**, type the file name, paste the contents and commit. For topic pages type `topics/linux.html` and so on. For the workflow, type `.github/workflows/ci.yml`. GitHub creates the folders for you.
3. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After about a minute, open `https://YOUR-USERNAME.github.io/shipyard/`.

> Opening `index.html` by double-clicking won't fully work, because browsers block JavaScript modules on `file://` paths. Use GitHub Pages, or run a local server in the folder:
> `python -m http.server 8000`, then open http://localhost:8000

## Run it with Docker (optional)

```bash
docker build -t shipyard .
docker run -d -p 8080:80 shipyard
# open http://localhost:8080
```

## How it uses DevOps

- **CI:** every push runs `.github/workflows/ci.yml`. It checks the JavaScript, checks every page exists, builds a Docker image and smoke-tests it with `curl`.
- **Containers:** the `Dockerfile` packages the site with nginx.
- **CD:** GitHub Pages redeploys the site automatically on every push to `main`.
- **Roadmap logic:** topics form a dependency graph (`needs` in `data.js`). React Flow draws it, and a topic unlocks only when everything it needs is done.

## Customise

- **Your name:** `STUDENT_NAME` at the top of `site.js`. The initials and footer text are in the HTML pages.
- **Starting progress:** `START` at the top of `site.js`.
- **Lesson text:** edit the topic's page in `topics/`.
- **Quiz questions or terminal commands:** edit that topic in `data.js`.
