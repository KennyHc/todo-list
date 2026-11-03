import { useAllTags, useTagColors, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { AiModal } from './AiModal';
import { ColorPicker } from './ColorPicker';
import { TagChip } from './TagChip';
import styles from './TagColorsDialog.module.css';

function Body() {
  const tags = useAllTags();
  // Re-render when a colour changes (the picker reads the map).
  const tagColors = useTagColors();

  if (tags.length === 0) {
    return <p className={styles.empty}>No tags yet. Add one with #tag when creating a task.</p>;
  }
  return (
    <ul className={styles.list}>
      {tags.map(({ tag, count }) => (
        <li key={tag} className={styles.row}>
          <div className={styles.who}>
            <TagChip tag={tag} hash />
            <span className={styles.count}>
              {count} {count === 1 ? 'task' : 'tasks'}
            </span>
          </div>
          <ColorPicker
            label={`Colour for #${tag}`}
            noneLabel="No colour"
            custom={false}
            value={tagColors[tag] ?? null}
            onChange={(hex) => useTaskStore.getState().setTagColor(tag, hex)}
          />
        </li>
      ))}
    </ul>
  );
}

/** "Tag colours": every tag with its count and a swatch row. Tasks take their first coloured tag's colour. */
export function TagColorsDialog() {
  const open = useUIStore((s) => s.tagColorsOpen);
  const close = () => useUIStore.getState().setTagColorsOpen(false);
  return (
    <AiModal
      open={open}
      onClose={close}
      title="Tag colours"
      subtitle="Give a tag a colour and every task with that tag shows it as a coloured edge."
      sheet
    >
      <Body />
    </AiModal>
  );
}
