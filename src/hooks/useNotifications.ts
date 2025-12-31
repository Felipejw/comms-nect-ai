import { useEffect, useCallback } from 'react';

export function useNotifications() {
  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  const showNotification = useCallback((title: string, body: string, icon?: string) => {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const notification = new Notification(title, { 
        body, 
        icon: icon || '/favicon.ico',
        tag: 'new-message'
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    }
  }, []);

  const isSupported = 'Notification' in window;
  const permission = isSupported ? Notification.permission : 'denied';

  return { 
    requestPermission, 
    showNotification, 
    isSupported,
    permission 
  };
}
