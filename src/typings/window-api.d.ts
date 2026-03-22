declare global {
  interface Window {
    api?: {
      askAI?: (query: string) => Promise<any>;
      onThemeUpdated?: (callback: (theme: string) => void) => void;
      getWeather?: (payload: { city: string }) => Promise<any>;
    };
  }
}

export {};
