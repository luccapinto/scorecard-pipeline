// Windowing had no test and, with 18 interviews in the demo, the windowed
// branch had never executed anywhere. Claiming "virtualises above 200 rows" in
// the README without exercising it is an unverified claim, so here it is
// exercised: both sides of the threshold, and the behaviour that makes
// windowing acceptable at all (the full count stays announced).

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VirtualList } from './VirtualList';

const ROW_HEIGHT = 20;
const VIEWPORT = 200;

function makeItems(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `item-${index}`);
}

function renderList(count: number, threshold = 200) {
  return render(
    <VirtualList
      items={makeItems(count)}
      threshold={threshold}
      rowHeight={ROW_HEIGHT}
      viewportHeight={VIEWPORT}
      aria-label="Lista de entrevistas"
    >
      {(item) => <li key={item}>{item}</li>}
    </VirtualList>,
  );
}

describe('VirtualList', () => {
  it('renders every row below the threshold', () => {
    renderList(50);
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    // No scroll container: native find-in-page and printing stay intact,
    // which is the reason the cheap path exists.
    expect(document.querySelector('.virtual')).toBeNull();
  });

  it('renders only a window above the threshold', () => {
    renderList(1000);
    const rendered = screen.getAllByRole('listitem');

    // A window plus overscan, nowhere near the full list.
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(60);
    expect(document.querySelector('.virtual')).not.toBeNull();
  });

  it('starts at the top of the list', () => {
    renderList(1000);
    expect(screen.getByText('item-0')).toBeInTheDocument();
    expect(screen.queryByText('item-900')).not.toBeInTheDocument();
  });

  it('reserves the full scroll height so the scrollbar is honest', () => {
    const { container } = renderList(1000);
    const spacer = container.querySelector('.virtual > div');
    expect(spacer).toHaveStyle({ height: `${1000 * ROW_HEIGHT}px` });
  });

  it('still announces the true item count when windowed', () => {
    renderList(1000);
    // Assistive tech must not be told there are only 20 items.
    expect(
      screen.getByRole('group', { name: /Lista de entrevistas.*1000 itens/ }),
    ).toBeInTheDocument();
  });

  it('keeps the list accessible name in both modes', () => {
    const { unmount } = renderList(10);
    expect(screen.getByRole('list', { name: 'Lista de entrevistas' })).toBeInTheDocument();
    unmount();

    renderList(1000);
    expect(screen.getByRole('list', { name: 'Lista de entrevistas' })).toBeInTheDocument();
  });

  it('exercises the exact threshold boundary', () => {
    const { unmount } = renderList(200, 200);
    // `items.length <= threshold` renders in full.
    expect(screen.getAllByRole('listitem')).toHaveLength(200);
    unmount();

    renderList(201, 200);
    expect(screen.getAllByRole('listitem').length).toBeLessThan(201);
  });
});
