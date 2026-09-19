import { describe, expect, it } from 'vitest';

import { createConnector } from './connectorTool';
import { pointEndpoint } from './geometry';

describe('createConnector', () => {
  it('новая линия получает светлый контур для тёмного холста', () => {
    const line = createConnector(pointEndpoint({ x: 0, y: 0 }), pointEndpoint({ x: 100, y: 0 }));

    expect(line.stroke).toBe('#f8fafc');
  });
});
