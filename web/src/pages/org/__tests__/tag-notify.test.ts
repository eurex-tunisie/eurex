import { describe, test, expect } from 'vitest';
import card from '../../../components/TagsCollaboration.tsx?raw';
import toast from '../../../components/TagsRecus.tsx?raw';
import comptable from '../OrgDashboardComptable.tsx?raw';
import expert from '../OrgDashboardExpert.tsx?raw';
import orgApiSrc from '../../../lib/orgApi.ts?raw';

describe('carte Collaboration (tags recus)', () => {
  test('charge 30 jours et rend les lignes cliquables vers la tache', () => {
    expect(card).toContain('getRecentTags(30)');
    expect(card).toContain('data-testid="tags-collaboration"');
    expect(card).toContain('data-testid="tag-collab-row"');
    expect(card).toContain('?task=${tg.task_id}');
  });

  test('masquee quand aucun tag', () => {
    expect(card).toContain('if (tags.length === 0) return null;');
  });
});

describe('toast nouveau tag', () => {
  test('poll 60 s, pas de toast au 1er chargement', () => {
    expect(toast).toContain('getRecentTags()');
    expect(toast).toContain('if (known.current === null)');
    expect(toast).toContain('}, 60000)');
  });
});

describe('dashboards', () => {
  test('carte + toast presents cote comptable et expert', () => {
    for (const src of [comptable, expert]) {
      expect(src).toContain('<TagsCollaboration />');
      expect(src).toContain('<TagsRecus />');
    }
  });
});

describe('api client', () => {
  test('getRecentTags accepte un nombre de jours', () => {
    expect(orgApiSrc).toContain('getRecentTags: (days: number = 2) =>');
  });
});
