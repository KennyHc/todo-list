import type { Difficulty } from '../types';

export const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  1: 'Trivial',
  2: 'Easy',
  3: 'Medium',
  4: 'Hard',
  5: 'Huge',
};

/** The name shown next to a level; the top level nudges towards splitting the task. */
export const difficultyLabel = (level: Difficulty): string =>
  level === 5 ? `${DIFFICULTY_NAMES[level]} — consider splitting` : DIFFICULTY_NAMES[level];

export const difficultyAria = (level: Difficulty): string =>
  `Difficulty ${level} of 5, ${DIFFICULTY_NAMES[level]}`;
