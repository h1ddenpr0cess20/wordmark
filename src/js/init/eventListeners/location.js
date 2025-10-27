export function setupLocationEventListeners() {
  if (!window.locationToggle) {
    return;
  }

  window.locationToggle.addEventListener('change', async(event) => {
    const isEnabled = event.target.checked;

    if (isEnabled) {
      if (typeof window.loadLocationModule === 'function' && !window.lazyModulesLoaded?.location) {
        await window.loadLocationModule();
      }

      const result = await window.requestLocation();
      if (result.success) {
        if (typeof window.updateLocationUI === 'function') {
          window.updateLocationUI();
        }
        if (window.VERBOSE_LOGGING) {
          console.info('Location enabled:', result.locationString);
        }
      } else {
        window.locationToggle.checked = false;
        if (typeof window.updateLocationUI === 'function') {
          window.updateLocationUI();
        }
        if (typeof window.showError === 'function') {
          window.showError(`Location request failed: ${result.error}`);
        }
        console.warn('Location request failed:', result.error);
      }
    } else {
      if (typeof window.disableLocation === 'function') {
        window.disableLocation();
      }
      if (typeof window.updateLocationUI === 'function') {
        window.updateLocationUI();
      }
      if (window.VERBOSE_LOGGING) {
        console.info('Location services disabled');
      }
    }

    if (typeof window.updateFeatureStatus === 'function') {
      window.updateFeatureStatus();
    }
  });
}

