<template lang="pug">
#app
  router-view
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({ name: 'playbooks-view' })
export default class App extends Vue {
  mounted(): void {
    const browserWindow = window as Window & {
      api?: {
        onThemeUpdated?: (callback: (theme: string) => void) => void;
      };
      require?: (module: string) => any;
    };

    const applyTheme = () => {
      const theme = localStorage.getItem('prime_browser_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
    };
    applyTheme();
    (window as any).addEventListener('storage', (event: any) => {
      if (event.key === 'prime_browser_theme') {
        applyTheme();
      }
    });

    if (browserWindow.api && browserWindow.api.onThemeUpdated) {
      browserWindow.api.onThemeUpdated((theme) => {
        localStorage.setItem('prime_browser_theme', theme);
        applyTheme();
      });
    }

    if (!(process.env.NODE_ENV === 'test' &&
      process.env.TEST_ENV === 'unit')) {
      // This is a hack to ensure that the app is always focused when it starts.
      // This is needed because the app can be launched from the tray, and if it's
      // not focused, it won't receive keyboard events.
      // This is only needed for Electron.
      if (typeof browserWindow.require === 'function') {
        const { remote } = browserWindow.require('electron');
        remote.getCurrentWindow().show();
      }
    }
  }
}
</script>

<style>
@import '../css/theme.css';

html, body {
  height: 100%;
}

body {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  font-family: Roboto, system-ui, PingFang TC, Heiti TC, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
}
#page-wrapper {
  width: auto;
  height: auto;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 600px;
}
h1 {
  font-size: 2.75em;
  font-weight: normal;
  margin-bottom: 0.25em;
  margin-top: 0;
}
h2 {
  font-size: 1.25em;
  font-family: ".SFNSText-Regular";
  font-weight: normal;
  text-align: justify;
  margin-top: 0;
}
a {
  color: cornflowerblue;
  text-decoration: none;
  background-image: linear-gradient(to bottom, transparent 80%, currentColor 0%);
  background-size: 1px 3px;
  background-position: 0px 0.975em;
  background-repeat: repeat-x;
}
button {
  float: right;
  -webkit-appearance: none;
  color: inherit;
  font-size: 1.1em;
  padding: 0.5em 1em;
  border: 0;
  background-color: rgba(0, 0, 0, 0.1);
  margin-top: 0.5em;
  cursor: pointer;
}
button.left {
  float: left;
}
</style>
