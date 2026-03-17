# Prime Browser

> Prime Browser is a lightweight browser built with Vue.js 2 and Electron.

<p align="center">
  <img alt="Prime Browser" src="https://i.imgur.com/5mO19u7.jpg" width="700px">
</p>

Prime Browser is an Electron-Vue browser project focused on a lightweight desktop browsing experience with a customizable new tab dashboard.

## Build Setup

```bash
# install dependencies
$ yarn install --ignore-engines

# prebuild the vendor.dll.js, which is a must-have file that will be used across main.js, renderer.js, and about.js.
$ yarn run build:dll

# serve with hot reload at localhost:9080
$ yarn run dev

# build electron applications for all platforms
$ yarn run build

# build the electron application for the specific target platform
$ yarn run build:darwin # macOS
$ yarn run build:linux  # Linux
$ yarn run build:mas    # Mac AppStore
$ yarn run build:win32  # Windows

# lint all JS/Vue component files in `src/`
$ yarn run lint

# lint and fix
$ yarn run lint:fix

# test the electron application for production
$ yarn run test
```

## API Support

- API integration support can be implemented in the Electron main process using secure IPC bridges.

## Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](code-of-conduct.md). By participating in this project you agree to abide by its terms.

---

This project was generated with [electron-vue](https://github.com/SimulatedGREG/electron-vue)@[1c165f7](https://github.com/SimulatedGREG/electron-vue/commit/1c165f7c5e56edaf48be0fbb70838a1af26bb015) and has been rebranded as Prime Browser.