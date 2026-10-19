import { useState, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { useTaskStore } from '../store/tasks';
import styles from './TaskInput.module.css';

export function TaskInput() {
  const add = useTaskStore((s) => s.add);
  const [value, setValue] = useState('');

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const title = value.trim();
    if (!title) return;
    add({ title });
    setValue('');
  };

  return (
    <div className={styles.composer}>
      <Plus className={styles.icon} size={16} strokeWidth={1.75} aria-hidden="true" />
      <input
        className={styles.input}
        value={value}
        placeholder="Add a task…"
        aria-label="New task"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <kbd className={`${styles.kbd} ${value.trim() ? styles.kbdOn : ''}`} aria-hidden="true">
        ↵
      </kbd>
    </div>
  );
}
