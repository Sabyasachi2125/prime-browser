<template lang="pug">
#page-wrapper(:class="`theme-${background}`")
  #particles-js

  .weather-widget
    .widget-title Weather
    .widget-value {{ weatherTemp }}
    .widget-sub {{ weatherDesc }}

  .time-widget
    .widget-value {{ currentTime }}
    .widget-sub {{ currentDate }}
    .theme-toggle-container
      label.switch
        input(
          type="checkbox"
          :checked="background === 'dark'"
          @change="toggleBackground($event)"
        )
        span.slider
      .theme-label {{ background }}

  .dashboard
    .logo-container(style="display: flex; justify-content: center; margin-bottom: 16px;")
      img(:src="logoUrl" style="height: 64px; width: auto;" alt="Prime Browser")
    h1.title Welcome to Prime Browser

    form.search-form(@submit.prevent="onSearchSubmit")
      .search-shell(:class="{ focused: isSearchFocused }")
        input.search-input(
          ref="searchInput"
          v-model.trim="searchQuery"
          type="text"
          placeholder=""
          aria-label="Smart search"
          @focus="isSearchFocused = true"
          @blur="isSearchFocused = false"
        )
        button.search-btn(type="submit") Go

    .ai-result(v-if="aiResult") {{ aiResult }}

    .subtitle-row
      template(v-if="isEditingSubtitle")
        input.subtitle-input(
          v-model.trim="subtitleDraft"
          type="text"
          maxlength="120"
          placeholder="Add a subtitle..."
          @keyup.enter="saveSubtitle"
        )
        button.small-btn(type="button" @click="saveSubtitle") Save
        button.small-btn(type="button" @click="cancelSubtitleEdit") Cancel
      template(v-else)
        p.subtitle {{ subtitle }}
        button.icon-btn(
          type="button"
          title="Edit subtitle"
          @click="startSubtitleEdit"
        ) &#9998;

    .quick-access
      h2 Quick Access
      form.add-form(@submit.prevent="addShortcut")
        input.form-input(
          v-model.trim="newShortcutTitle"
          type="text"
          maxlength="40"
          placeholder="Title"
          required
        )
        input.form-input(
          v-model.trim="newShortcutUrl"
          type="text"
          maxlength="2048"
          placeholder="URL (example.com)"
          required
        )
        button.small-btn(
          type="submit"
          :disabled="shortcuts.length >= maxShortcuts"
        ) Add

      p.limit-note(v-if="shortcuts.length >= maxShortcuts")
        | Maximum of {{ maxShortcuts }} shortcuts reached.

      .cards
        a.card(
          v-for="(shortcut, index) in shortcuts"
          :key="`${shortcut.title}-${index}`"
          :href="normalizedUrl(shortcut.url)"
        )
          img.card-favicon(
            :src="faviconUrl(shortcut.url)"
            alt=""
          )
          .card-main
            .card-title {{ shortcut.title }}
            .card-url {{ normalizedUrl(shortcut.url) }}
          button.delete-btn(
            type="button"
            @click.prevent="deleteShortcut(index)"
          ) Delete
</template>

<script lang="ts">
import Vue from 'vue';

declare const __static: string;

interface Shortcut {
  title: string;
  url: string;
}

interface WeatherResponse {
  ok?: boolean;
  error?: string;
  data?: {
    temp?: number;
    condition?: string;
  };
}

interface AIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: any;
}

interface Window {
  api: {
    askAI: (query: string) => Promise<AIResponse>;
    getWeather: (payload: { city: string }) => Promise<WeatherResponse>;
  };
  particlesJS?: (id: string, config: any) => void;
}

declare const window: Window;

const SUBTITLE_KEY = 'prime_browser_newtab_subtitle';
const BACKGROUND_KEY = 'prime_browser_theme';
const SHORTCUTS_KEY = 'prime_browser_newtab_shortcuts';

export default Vue.extend({
  name: 'Newtab',
  data() {
    // eslint-disable-next-line import/no-webpack-loader-syntax
    // eslint-disable-next-line import/no-webpack-loader-syntax
    const logoReq = require(
      '!!url-loader?limit=500000!../../../../../static/icons/logo.png'
    );
    const logoUrl = logoReq && logoReq.default ? logoReq.default : logoReq;
    return {
      logoUrl,
      subtitle: 'Your personalized home dashboard',
      subtitleDraft: '',
      isEditingSubtitle: false,
      showBackgroundOptions: false,
      background: 'dark',
      newShortcutTitle: '',
      newShortcutUrl: '',
      maxShortcuts: 6,
      shortcuts: [] as Shortcut[],
      searchQuery: '',
      aiResult: '',
      currentTime: '',
      currentDate: '',
      weatherTemp: '-- C',
      weatherDesc: 'Loading...',
      isSearchFocused: false,
      clockTimer: 0,
    };
  },
    mounted() {
      document.title = 'Prime Browser';
      this.loadFromStorage();
      this.updateTime();
      this.clockTimer = setInterval(() => {
        this.updateTime();
      }, 1000);
      this.loadWeather();
      this.initParticles();
      this.$nextTick(() => {
        const searchInput = this.$refs.searchInput as HTMLInputElement | undefined;
        if (searchInput) {
          searchInput.focus();
          this.isSearchFocused = true;
        }
      });
    },
    beforeDestroy() {
      if (this.clockTimer) {
        clearInterval(this.clockTimer);
      }
    },
    methods: {
      loadFromStorage(): void {
        const subtitle = localStorage.getItem(SUBTITLE_KEY);
        if (subtitle && subtitle.trim() !== '') {
          this.subtitle = subtitle;
        }

        const background = localStorage.getItem(BACKGROUND_KEY) || 'dark';
        if (
          background === 'light' ||
          background === 'dark'
        ) {
          this.background = background;
          document.documentElement.setAttribute('data-theme', background);
        }

      const shortcuts = localStorage.getItem(SHORTCUTS_KEY);
      if (shortcuts) {
        try {
          const parsed = JSON.parse(shortcuts);
          if (Array.isArray(parsed)) {
            this.shortcuts = parsed
              .filter(
                item => item &&
                  typeof item.title === 'string' &&
                  typeof item.url === 'string'
              )
              .slice(0, this.maxShortcuts);
          }
        } catch (error) {
          this.shortcuts = [];
        }
      }
    },
    startSubtitleEdit(): void {
      this.subtitleDraft = this.subtitle;
      this.isEditingSubtitle = true;
    },
    cancelSubtitleEdit(): void {
      this.subtitleDraft = '';
      this.isEditingSubtitle = false;
    },
    saveSubtitle(): void {
      const next = this.subtitleDraft.trim();
      this.subtitle = next !== '' ? next : 'Your personalized home dashboard';
      localStorage.setItem(SUBTITLE_KEY, this.subtitle);
      this.cancelSubtitleEdit();
    },
    setBackground(nextBackground: string): void {
      if (!['light', 'dark'].includes(nextBackground)) {
        return;
      }
      this.background = nextBackground;
      localStorage.setItem(BACKGROUND_KEY, this.background);
      document.documentElement.setAttribute('data-theme', this.background);
      this.showBackgroundOptions = false;

      // Dispatch globally via ContextBridge api proxy
      if ((window as any).api && (window as any).api.setTheme) {
        (window as any).api.setTheme(this.background);
      }
    },
    toggleBackground(e: Event): void {
      const target = e.target as HTMLInputElement;
      this.setBackground(target.checked ? 'dark' : 'light');
    },
    normalizedUrl(raw: string): string {
      const value = raw.trim();
      if (/^https?:\/\//i.test(value)) {
        return value;
      }
      return `https://${value}`;
    },
    extractDomain(rawUrl: string): string {
      try {
        return new URL(this.normalizedUrl(rawUrl)).hostname;
      } catch (error) {
        return rawUrl;
      }
    },
    faviconUrl(rawUrl: string): string {
      const domain = this.extractDomain(rawUrl);
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    },
    saveShortcuts(): void {
      localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(this.shortcuts));
    },
    addShortcut(): void {
      if (this.shortcuts.length >= this.maxShortcuts) {
        return;
      }
      const title = this.newShortcutTitle.trim();
      const url = this.newShortcutUrl.trim();
      if (!title || !url) {
        return;
      }
      this.shortcuts.push({ title, url });
      this.saveShortcuts();
      this.newShortcutTitle = '';
      this.newShortcutUrl = '';
    },
    deleteShortcut(index: number): void {
      this.shortcuts.splice(index, 1);
      this.saveShortcuts();
    },
    updateTime(): void {
      const now = new Date();
      this.currentTime = now.toLocaleTimeString();
      this.currentDate = now.toLocaleDateString();
    },
    async loadWeather(): Promise<void> {
      if (!window.api || !window.api.getWeather) {
        this.weatherDesc = 'Unavailable';
        return;
      }
      try {
        const response = await window.api.getWeather({ city: 'Bhubaneswar' });
        if (response && response.ok && response.data) {
          const { temp, condition } = response.data;
          this.weatherTemp = typeof temp === 'number' ? `${temp} C` : '-- C';
          this.weatherDesc = condition || 'Unknown';
        } else {
          this.weatherTemp = '-- C';
          this.weatherDesc = 'Unavailable';
        }
      } catch (error) {
        this.weatherTemp = '-- C';
        this.weatherDesc = 'Unavailable';
      }
    },
    initParticles(): void {
      if (window.particlesJS) {
        window.particlesJS('particles-js', {
          particles: {
            number: { value: 80 },
            size: { value: 3 },
            move: { speed: 2 },
            line_linked: { enable: true },
          },
        });
      }
    },
    async onSearchSubmit(): Promise<void> {
      const query = this.searchQuery.trim();
      if (!query) {
        return;
      }

      if (query.toLowerCase().startsWith('ai:')) {
        const aiQuery = query.slice(3).trim();
        await this.askAssistant(aiQuery);
        return;
      }

      const looksLikeUrl =
        /^https?:\/\//i.test(query) ||
        query.includes('.');
      const target = looksLikeUrl
        ? this.normalizedUrl(query)
        : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      document.location.href = target;
    },
    async askAssistant(query: string): Promise<void> {
      if (!query) {
        this.aiResult = 'Please enter a question after ai:';
        return;
      }
      if (!window.api || !window.api.askAI) {
        this.aiResult = 'AI service unavailable';
        return;
      }
      try {
        const response = await window.api.askAI(query);
        this.aiResult = response?.choices?.[0]?.message?.content ||
          'No response received.';
      } catch (error) {
        this.aiResult = 'AI request failed.';
      }
    },
  },
});
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
  background: #070b16;
}

#particles-js {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}

#page-wrapper {
  min-height: 100vh;
  width: 100%;
  margin: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 56px 20px 32px;
  box-sizing: border-box;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: background 0.28s ease, color 0.28s ease;
}

.theme-light {
}

.theme-light .weather-widget,
.theme-light .time-widget {
  background: var(--card-bg);
  border-color: var(--border-color);
  box-shadow: 0 10px 26px var(--shadow-color);
}

.theme-light .dashboard {
  background: var(--card-bg);
  border-color: var(--border-color);
  box-shadow: 0 24px 56px var(--shadow-color);
}

.theme-light .title,
.theme-light .subtitle,
.theme-light .quick-access h2,
.theme-light .widget-title,
.theme-light .widget-value,
.theme-light .widget-sub,
.theme-light .limit-note,
.theme-light .card-title,
.theme-light .card-url {
  color: var(--text-primary);
}

.theme-dark {
}

.weather-widget,
.time-widget {
  position: fixed;
  top: 16px;
  z-index: 5;
  padding: 10px 12px;
  border-radius: 12px;
  backdrop-filter: blur(14px);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.weather-widget {
  left: 16px;
}

.time-widget {
  right: 16px;
  text-align: right;
}

.widget-title {
  font-size: 11px;
  opacity: 0.7;
}

.widget-value {
  font-size: 16px;
  font-weight: 600;
}

.widget-sub {
  font-size: 12px;
  opacity: 0.8;
}

.dashboard {
  width: 100%;
  max-width: 980px;
  border-radius: 24px;
  padding: 28px;
  box-sizing: border-box;
  backdrop-filter: blur(20px);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: 0 20px 60px var(--shadow-color);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.title {
  margin: 0 0 16px;
  text-align: center;
  font-size: 42px;
  line-height: 1.12;
}

.search-form {
  width: 100%;
  max-width: 760px;
  margin: 0 auto 14px;
}

.search-shell {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 50px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(10px);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.search-shell.focused {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px rgba(255, 140, 0, 0.2),
    0 10px 28px rgba(255, 140, 0, 0.3);
}

.search-input {
  flex: 1;
  border: 0;
  outline: none;
  font-size: 16px;
  color: inherit;
  background: transparent;
}

.search-input::placeholder {
  color: rgba(223, 233, 255, 0.78);
}

.theme-light .search-shell {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(137, 162, 214, 0.45);
}

.theme-light .search-input {
  color: #14203a;
}

.theme-light .search-input::placeholder {
  color: rgba(31, 43, 70, 0.55);
}

.search-btn {
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--accent-color);
  cursor: pointer;
}

.ai-result {
  max-width: 760px;
  margin: 0 auto 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(35, 52, 93, 0.45);
  border: 1px solid rgba(132, 168, 255, 0.35);
  color: #edf2ff;
  text-align: left;
  white-space: pre-wrap;
}

.subtitle-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}

.subtitle {
  margin: 0;
  font-size: 16px;
  opacity: 0.86;
}

.subtitle-input,
.form-input {
  width: 260px;
  max-width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  outline: none;
  font-size: 14px;
  color: inherit;
  background: var(--bg-secondary);
}

.theme-light .subtitle-input,
.theme-light .form-input {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.theme-light .small-btn,
.theme-light .icon-btn,
.theme-light .delete-btn {
  color: var(--text-primary);
  background: var(--card-bg);
  border-color: var(--border-color);
}

.theme-light .card {
  color: var(--text-primary);
  background: var(--card-bg);
  border-color: var(--border-color);
}

.theme-light .ai-result {
  color: var(--text-primary);
  background: var(--card-bg);
  border-color: var(--border-color);
}

.background-controls {
  margin-bottom: 24px;
}

.theme-toggle-container {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-top: 14px;
  gap: 6px;
}

.theme-label {
  font-size: 11px;
  opacity: 0.8;
  text-transform: capitalize;
}

.quick-access h2 {
  margin: 0 0 12px;
  font-size: 26px;
}

.add-form {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.small-btn,
.icon-btn,
.delete-btn {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.small-btn:hover,
.icon-btn:hover,
.delete-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}

.small-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.icon-btn {
  width: 40px;
  padding: 9px 0;
}

.limit-note {
  margin: 0 0 12px;
  font-size: 12px;
  opacity: 0.78;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.card {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  border-radius: 14px;
  padding: 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 28px var(--shadow-color);
}

.card-favicon {
  width: 20px;
  height: 20px;
  border-radius: 6px;
}

.card-main {
  min-width: 0;
  flex: 1;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-url {
  font-size: 12px;
  opacity: 0.82;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delete-btn {
  padding: 6px 10px;
  font-size: 12px;
}

@media (max-width: 900px) {
  .weather-widget,
  .time-widget {
    position: static;
    margin-bottom: 8px;
  }

  #page-wrapper {
    padding-top: 20px;
  }
}

@media (max-width: 768px) {
  #page-wrapper {
    padding: 18px 12px 20px;
  }

  .dashboard {
    padding: 20px;
  }

  .title {
    font-size: 34px;
  }

  .search-form,
  .ai-result {
    max-width: 100%;
  }

  .subtitle-input,
  .form-input {
    width: 100%;
  }

  .cards {
    grid-template-columns: 1fr;
  }
}

/* The switch - the box around the slider */
.switch {
  display: block;
  --width-of-switch: 3.5em;
  --height-of-switch: 2em;
  /* size of sliding icon -- sun and moon */
  --size-of-icon: 1.4em;
  /* it is like a inline-padding of switch */
  --slider-offset: 0.3em;
  position: relative;
  width: var(--width-of-switch);
  height: var(--height-of-switch);
}

/* Hide default HTML checkbox */
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

/* The slider */
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #f4f4f5;
  transition: .4s;
  border-radius: 30px;
}

.slider:before {
  position: absolute;
  content: "";
  height: var(--size-of-icon,1.4em);
  width: var(--size-of-icon,1.4em);
  border-radius: 20px;
  left: var(--slider-offset,0.3em);
  top: 50%;
  transform: translateY(-50%);
  background: linear-gradient(40deg,#ff0080,#ff8c00 70%);
  transition: .4s;
}

input:checked + .slider {
  background-color: #303136;
}

input:checked + .slider:before {
  left: calc(100% - (var(--size-of-icon,1.4em) + var(--slider-offset,0.3em)));
  background: #303136;
  /* change second inset value to edit moon angle */
  box-shadow: inset -3px -2px 5px -2px #8983f7, inset -10px -4px 0 0 #a3dafb;
}
</style>
