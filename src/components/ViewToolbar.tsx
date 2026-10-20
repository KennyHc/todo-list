import { SearchButton } from './SearchButton';
import { TagFilter } from './TagFilter';
import styles from './ViewToolbar.module.css';
import { ViewSwitch } from './ViewSwitch';

export function ViewToolbar() {
  return (
    <div className={styles.bar} data-intro="3">
      <ViewSwitch />
      <div className={styles.actions}>
        <SearchButton />
        <TagFilter />
      </div>
    </div>
  );
}
