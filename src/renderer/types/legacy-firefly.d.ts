export {};

declare global {
  interface Window {
    cyrene: Window["firefly"];
    cyreneTheme?: Window["fireflyTheme"];
    cyreneFont?: Window["fireflyFont"];
    cyreneAppearance?: Window["fireflyAppearance"];
    cyreneWindowAppearance?: Window["fireflyWindowAppearance"];
    cyreneScheduler?: Window["fireflyScheduler"];
  }
}
