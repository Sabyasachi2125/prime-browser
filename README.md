# Prime Browser

> Prime Browser is a lightweight browser built with Vue.js 2 and Electron.

<p align="center">
  <img alt="Prime Browser" src="https://i.imgur.com/5mO19u7.jpg" width="700px">
</p>

Prime Browser is an Electron-Vue browser project focused on a lightweight desktop browsing experience with a customizable new tab dashboard.

## Current Working Prototype

This repository currently contains the working prototype with the features added so far, including:

- customized Prime Browser branding
- AI page summarization with sidebar UI
- improved new tab dashboard behavior
- fixed tab switching and tab closing behavior
- working search flow from the address bar and new tab page
- cleaned development startup flow compared to the earlier broken state

If the current changes are pushed to GitHub together with `package.json`, `yarn.lock`, and the source files under `src/` and `.electron-vue/`, then this working prototype is preserved safely in the repo. If the current local folder is lost or crashes later, cloning the repo and reinstalling dependencies should restore this same working state.

## Recommended Environment

This is the environment that matches the currently working setup:

- OS: Windows 10/11 recommended
- Node.js: `16.20.2`
- Yarn: `1.22.22` (Yarn Classic)
- Electron: `9.4.1`

Notes:

- The project uses an older Electron-Vue stack, so using a much newer Node.js version can reintroduce breakage.
- The safest choice is Node `16.20.2` with Yarn Classic `1.22.22`.
- Git should be installed before cloning the repo.

## Fresh Clone Recovery

If your current project folder gets deleted, corrupted, or lost, use:

```bash
git clone https://github.com/Sabyasachi2125/prime-browser.git
cd prime-browser
```

Then use the exact setup below.

### 1. Install prerequisites

Recommended:

- Install Node.js `16.20.2`
- Install Yarn Classic `1.22.22`

Optional but useful:

- VS Code
- Git

### 2. Install dependencies

```bash
yarn install --ignore-engines
```

### 3. Build the vendor DLL

This project expects the vendor bundle to exist before development starts:

```bash
yarn run build:dll
```

### 4. Start the browser in development mode

```bash
yarn run dev
```

## Clean Setup Commands

For a clean run on a new device, the usual sequence is:

```bash
yarn install --ignore-engines
yarn run build:dll
yarn run dev
```

## If Something Breaks After Clone

Use this cleanup flow:

```bash
rm -rf node_modules dist
yarn install --ignore-engines
yarn run build:dll
yarn run dev
```

On Windows PowerShell, if you want the equivalent cleanup:

```powershell
Remove-Item node_modules -Recurse -Force
Remove-Item dist -Recurse -Force
yarn install --ignore-engines
yarn run build:dll
yarn run dev
```

If you still see dependency drift, also remove the lockfile only if you intentionally want a full reinstall:

```powershell
Remove-Item yarn.lock -Force
yarn install --ignore-engines
```

That is not the preferred path for this prototype. Keeping the committed `yarn.lock` is safer.

## Build Setup

```bash
# install dependencies
$ yarn install --ignore-engines

# prebuild the vendor.dll.js, which is required across the app
$ yarn run build:dll

# serve with hot reload at localhost:9080
$ yarn run dev

# build electron applications for all platforms
$ yarn run build

# build electron application for a specific platform
$ yarn run build:darwin # macOS
$ yarn run build:linux  # Linux
$ yarn run build:mas    # Mac AppStore
$ yarn run build:win32  # Windows

# lint all JS/Vue component files in src/
$ yarn run lint

# lint and fix
$ yarn run lint:fix

# test the electron application for production
$ yarn run test
```

## Recommended Safety Workflow

To safely preserve this working prototype:

1. Commit all current source changes.
2. Push them to GitHub.
3. Keep `package.json` and `yarn.lock` committed together.
4. Tag the working state before packaging if you want a stable restore point.

A good example:

```bash
git add .
git commit -m "Save working Prime Browser prototype"
git push origin main
git tag -a v1-working-prototype -m "Working prototype before packaging"
git push origin v1-working-prototype
```

## Terminal Log Status

From the latest terminal log:

- the project compiles successfully
- all major renderer/main targets report `No issues found`
- the browser launches and runs

There are still a few legacy dev-console warnings from the older Electron stack, but they are not currently blocking the browser from running:

- TypeScript support warning from `@typescript-eslint/typescript-estree`
- Electron protocol deprecation warnings
- repeated `node-forge` ECC fallback notices

These are not ideal, but the browser is currently in a working state.

## API Support

- API integration support can be implemented in the Electron main process using secure IPC bridges.

## Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](code-of-conduct.md). By participating in this project you agree to abide by its terms.

---

This project was generated with [electron-vue](https://github.com/SimulatedGREG/electron-vue)@[1c165f7](https://github.com/SimulatedGREG/electron-vue/commit/1c165f7c5e56edaf48be0fbb70838a1af26bb015) and has been rebranded as Prime Browser.
