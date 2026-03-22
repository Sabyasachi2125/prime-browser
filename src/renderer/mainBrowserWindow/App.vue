<template lang="pug">
#app
  router-view
</template>

<script>
export default {
  name: 'LulumiBrowser',
  mounted() {
    const applyTheme = () => {
      const theme = localStorage.getItem('prime_browser_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
    };
    applyTheme();
    window.addEventListener('storage', (event) => {
      if (event.key === 'prime_browser_theme') {
        applyTheme();
      }
    });

    if (this.$electron && this.$electron.ipcRenderer) {
      this.$electron.ipcRenderer.on('theme-updated', (event, theme) => {
        localStorage.setItem('prime_browser_theme', theme);
        applyTheme();
      });
    }
  }
};
</script>

<style lang="less">
@import (css) url('https://fonts.googleapis.com/css?family=Source+Code+Pro');
@import '../css/theme.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: initial;
}

html, body {
  height: 100%;
}

body {
  /* Removed old gradient */
  display: flex;
  font-family: 'Source Code Pro', Courier, monospace;;
  justify-content: center;
  text-align: center;

  &.darwin {
    &:not(.fullscreen) {
      // make room for the traffic lights
      .tabs {
        padding-left: 70px;
      }
    }
  }
}
</style>
