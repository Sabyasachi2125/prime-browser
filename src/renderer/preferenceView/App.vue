<template lang="pug">
#app
  router-view
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

interface Window {
  data: Record<string, any>;
}

declare const window: Window;

@Component({ name: 'lulumi-browser' })
export default class App extends Vue {
  mounted(): void {
    if (!(process.env.NODE_ENV === 'test' &&
      process.env.TEST_ENV === 'unit')) {
      if (window.data.about) {
        this.$store.dispatch('updateAbout', window.data.about);
      } else {
        console.warn('Error: window.data.about not found!');
      }
      if (window.data.manifestMap) {
        const { backgroundPages, manifestMap } = window.data;
        const extensions = {};
        Object.keys(manifestMap).forEach((extension) => {
          if (backgroundPages[extension]) {
            extensions[extension] = backgroundPages[extension];
          } else {
            extensions[extension] = manifestMap[extension];
          }
        });
        this.$store.dispatch('updateExtensions', extensions);
      } else {
        console.warn('Error: window.extensions not found!');
      }
    }
  }
}
</script>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  box-sizing: border-box;
  font-family: Roboto, system-ui, PingFang TC, Heiti TC, sans-serif;
}

#app > * {
  width: 100%;
  min-height: 100vh;
}

#page-wrapper {
  width: 100%;
  min-height: 100vh;
  margin: 0;
  position: relative;
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
