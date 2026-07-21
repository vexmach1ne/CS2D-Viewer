export {};

declare global {
  interface Window {
    cs2Viewer?: {
      openDemo(): Promise<unknown>;
      restoreSession(): Promise<unknown>;
      rebuildActiveDemo(): Promise<unknown>;
      cancelParse(): Promise<boolean>;
      saveSessionPatch(state: unknown): Promise<unknown>;
      getAudioCatalog(): Promise<unknown>;
      onParseProgress(callback: (progress: {
        stage?: string;
        progress?: number;
        percent?: number;
        message?: string;
      }) => void): () => void;
    };
  }
}
