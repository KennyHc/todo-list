import { TagFilter } from './TagFilter';
import styles from './ViewToolbar.module.css';
import { ViewSwitch } from './ViewSwitch';

export function ViewToolbar() {
  return (
    <div className={styles.bar}>
      <ViewSwitch />
      <TagFilter />
    </div>
  );
}
