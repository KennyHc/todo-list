import { useCallback, useRef, useState } from 'react';
import { motion, type MotionProps } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { useTask, useTaskStore } from '../store/tasks';
import { ColorPicker } from './ColorPicker';
import { DatePicker } from './DatePicker';
import { Popover } from './Popover';
import { TagEditor } from './TagEditor';
import styles from './TaskMenu.module.css';

type Props = { id: string; buttonClassName: string; motionProps: MotionProps };

/** The "more" button and its popover: tags, due date and colour. */
export function TaskMenu({ id, buttonClassName, motionProps }: Props) {
  const task = useTask(id);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  if (!task) return null;

  const update = useTaskStore.getState().update;
  return (
    <>
      <motion.button
        {...motionProps}
        ref={anchorRef}
        type="button"
        className={buttonClassName}
        aria-label="More options"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={15} strokeWidth={1.75} aria-hidden="true" />
      </motion.button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label="Task options"
        align="end"
        width={284}
      >
        <div className={styles.sections}>
          <section className={styles.section}>
            <h3 className={styles.heading}>Tags</h3>
            <TagEditor compact tags={task.tags} onChange={(tags) => update(id, { tags })} />
          </section>
          <section className={styles.section}>
            <h3 className={styles.heading}>Due date</h3>
            <DatePicker value={task.dueDate} onChange={(dueDate) => update(id, { dueDate })} />
          </section>
          <section className={styles.section}>
            <h3 className={styles.heading}>Colour</h3>
            <ColorPicker value={task.color} onChange={(color) => update(id, { color })} />
          </section>
        </div>
      </Popover>
    </>
  );
}
