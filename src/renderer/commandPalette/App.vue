<template lang="pug">
#app
  router-view
</template>

<script lang="ts">
export default {
  name: 'CommandPalette',
  mounted() {
    const browserWindow = window as Window & {
      api?: {
        onThemeUpdated?: (callback: (theme: string) => void) => void;
      };
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
  }
};
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
</style>
