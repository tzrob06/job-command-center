import { useEffect } from 'react';
import { exportAllData } from '../db';
import { format } from 'date-fns';

export default function useAutoBackup() {
  useEffect(() => {
    const checkAndRunBackup = async () => {
      const lastBackup = localStorage.getItem('last_auto_backup');
      const now = Date.now();
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      
      // If no backup exists yet, or it's been more than a week
      if (!lastBackup || (now - parseInt(lastBackup, 10)) > ONE_WEEK_MS) {
        try {
          const data = await exportAllData();
          const jsonStr = JSON.stringify(data, null, 2);
          
          try {
            // Attempt to save to the local file system via the Vite dev server plugin
            const response = await fetch('/api/save-backup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: jsonStr
            });
            
            if (response.ok) {
              console.log('Weekly auto-backup saved to project backups directory successfully.');
              localStorage.setItem('last_auto_backup', now.toString());
              return; // We succeeded, skip browser download
            }
          } catch (e) {
            console.warn('Local save failed (possibly not running Vite dev server), falling back to browser download.', e);
          }
          
          // Fallback: trigger browser download
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = url;
          a.download = `job-command-center-backup-${format(now, 'yyyy-MM-dd')}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          localStorage.setItem('last_auto_backup', now.toString());
        } catch (err) {
          console.error('Failed to run auto-backup', err);
        }
      }
    };

    // Delay slightly so it doesn't block initial page load rendering
    const timer = setTimeout(checkAndRunBackup, 2000);
    return () => clearTimeout(timer);
  }, []);
}
