/**
 * Toast-style notification system for transient error and status messages.
 *
 * @remarks
 * Styling lives in `src/css/components/ui/notifications.css` (bundled via
 * `main.css`); this module only manages the container and notification DOM.
 */

let notificationContainer: HTMLElement | null = null;

/**
 * Creates the notification container.
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
  notification.setAttribute("role", type === "error" || type === "warning" ? "alert" : "status");

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
