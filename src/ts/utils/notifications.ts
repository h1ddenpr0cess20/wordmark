/**
 * Toast-style notification system for transient error and status messages.
 */

let notificationContainer: HTMLElement | null = null;

/**
 * Creates the notification container and injects its stylesheet.
 *
 * @remarks
 * Idempotent and a no-op outside a DOM environment (e.g. Node tests).
 */
export function initNotificationSystem() {
  if (typeof document === "undefined") {
    return;
  }
  if (notificationContainer) {
    return;
  }

  notificationContainer = document.createElement("div");
  notificationContainer.id = "notification-container";
  notificationContainer.className = "notification-container";
  document.body.appendChild(notificationContainer);

  if (!document.getElementById("notification-styles")) {
    const style = document.createElement("style");
    style.id = "notification-styles";
    style.textContent = `
      .notification-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
        max-width: 400px;
      }
      
      .notification {
        background: var(--bg-secondary, #f8f9fa);
        background: color-mix(in srgb, var(--bg-secondary, #f8f9fa) 94%, transparent);
        color: var(--text-primary, #333);
        border: 1px solid var(--border-color, #ddd);
        border-color: color-mix(in srgb, var(--border-color, #ddd) 75%, transparent);
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        pointer-events: auto;
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s ease;
        position: relative;
        max-width: 100%;
        word-wrap: break-word;
      }
      
      .notification.show {
        transform: translateX(0);
        opacity: 1;
      }
      
      .notification.error {
        --tone-color: var(--error-text, #c33);
        --tone-surface: var(--error-bg, var(--tone-color));
        color: var(--tone-color);
        background: var(--tone-surface);
        background: color-mix(in srgb, var(--tone-surface) 60%, var(--bg-secondary, #f8f9fa) 40%);
        border-color: var(--tone-color);
        border-color: color-mix(in srgb, var(--tone-color) 55%, transparent);
      }
      
      .notification.warning {
        --tone-color: var(--warning-color, color-mix(in srgb, var(--accent-color, #f4c361) 65%, #f4c361 35%));
        color: var(--tone-color);
        background: var(--warning-bg, var(--tone-color));
        background: color-mix(in srgb, var(--tone-color) 18%, var(--bg-secondary, #f8f9fa));
        border-color: var(--tone-color);
        border-color: color-mix(in srgb, var(--tone-color) 45%, transparent);
      }
      
      .notification.success {
        --tone-color: var(--success-color, color-mix(in srgb, var(--accent-color, #3dd68c) 70%, #3dd68c 30%));
        --tone-surface: var(--success-bg, var(--tone-color));
        color: var(--tone-color);
        background: var(--tone-surface);
        background: color-mix(in srgb, var(--tone-surface) 18%, var(--bg-secondary, #f8f9fa));
        border-color: var(--tone-color);
        border-color: color-mix(in srgb, var(--tone-color) 45%, transparent);
      }
      
      .notification.info {
        --tone-color: var(--info-color, color-mix(in srgb, var(--accent-color, #5bc0eb) 65%, #5bc0eb 35%));
        --tone-surface: var(--info-bg, var(--tone-color));
        color: var(--tone-color);
        background: var(--tone-surface);
        background: color-mix(in srgb, var(--tone-surface) 18%, var(--bg-secondary, #f8f9fa));
        border-color: var(--tone-color);
        border-color: color-mix(in srgb, var(--tone-color) 45%, transparent);
      }
      
      .notification-close {
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: opacity 0.2s;
      }
      
      .notification-close:hover {
        opacity: 1;
        background: color-mix(in srgb, var(--text-primary, #333) 15%, transparent);
      }
      
      .notification-message {
        margin-right: 24px;
        font-size: 14px;
        line-height: 1.4;
      }
      
      @media (max-width: 480px) {
        .notification-container {
          left: 20px;
          right: 20px;
          max-width: none;
        }
        
        .notification {
          margin-bottom: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Displays a toast notification and returns its element.
 *
 * @param message - Text to display.
 * @param type - Visual tone: `error`, `warning`, `success`, or `info`.
 * @param duration - Auto-dismiss delay in milliseconds; `0` keeps it until
 * the user closes it.
 * @returns The notification element (for manual control), or `null` outside a
 * DOM environment.
 */
export function showNotification(message: string, type: string = "info", duration: number = 5000): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (!notificationContainer) {
    initNotificationSystem();
  }

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;

  const messageEl = document.createElement("div");
  messageEl.className = "notification-message";
  messageEl.textContent = message;

  const closeBtn = document.createElement("button");
  closeBtn.className = "notification-close";
  closeBtn.innerHTML = "×";
  closeBtn.setAttribute("aria-label", "Close notification");

  notification.appendChild(messageEl);
  notification.appendChild(closeBtn);

  notificationContainer!.appendChild(notification);

  requestAnimationFrame(() => {
    notification.classList.add("show");
  });

  let autoRemoveTimeout: ReturnType<typeof setTimeout> | undefined;
  if (duration > 0) {
    autoRemoveTimeout = setTimeout(() => {
      removeNotification(notification);
    }, duration);
  }

  closeBtn.addEventListener("click", () => {
    if (autoRemoveTimeout) {
      clearTimeout(autoRemoveTimeout);
    }
    removeNotification(notification);
  });

  return notification;
}

/** Animates a notification out and removes it from the DOM. */
function removeNotification(notification: HTMLElement) {
  if (!notification || !notification.parentNode) {
    return;
  }

  notification.classList.remove("show");

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

/** Shows an error notification (8s). */
export function showError(message: string) {
  return showNotification(message, "error", 8000);
}

/** Shows a warning notification (6s). */
export function showWarning(message: string) {
  return showNotification(message, "warning", 6000);
}

/** Shows a success notification (4s). */
export function showSuccess(message: string) {
  return showNotification(message, "success", 4000);
}

/** Shows an info notification (5s). */
export function showInfo(message: string) {
  return showNotification(message, "info", 5000);
}

/** Removes every currently visible notification. */
export function clearAllNotifications() {
  if (notificationContainer) {
    const notifications = notificationContainer.querySelectorAll<HTMLElement>(".notification");
    notifications.forEach(removeNotification);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNotificationSystem);
  } else {
    initNotificationSystem();
  }
}
