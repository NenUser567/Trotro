export function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

export function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isInSafari() {
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)")?.matches
  );
}
