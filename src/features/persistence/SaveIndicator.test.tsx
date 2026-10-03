import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useSaveStatus } from './autosave';
import { SaveIndicator } from './SaveIndicator';

afterEach(() => {
  cleanup();
  useSaveStatus.getState().setStatus('idle');
});

describe('SaveIndicator', () => {
  it('не показывает промежуточную загрузку', () => {
    useSaveStatus.getState().setStatus('saving');

    render(<SaveIndicator />);

    expect(screen.queryByText('Сохранение…')).toBeNull();
  });

  it('показывает завершённое сохранение', () => {
    useSaveStatus.getState().setStatus('saved');

    render(<SaveIndicator />);

    expect(screen.getByText('Все изменения сохранены')).toBeDefined();
  });
});
