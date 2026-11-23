import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import './action-toast.css';

export function ActionToast({ message }: { message: string }) {
  return message ? <TimedToast key={message} message={message} /> : null;
}

function TimedToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  return visible ? <div className="action-toast">
    <span role="status">{message}</span>
    <button type="button" aria-label="关闭提示" onClick={() => setVisible(false)}><X size={16} aria-hidden="true" /></button>
  </div> : null;
}
