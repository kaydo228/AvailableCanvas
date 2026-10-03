import { describe, expect, it } from 'vitest';
import { doc, shape } from '@/shared/model/fixtures';
import type { BoxNode, Node } from '@/shared/types/document';
import { createConnector } from './connectorTool';
import { endpointAt, nodeEndpoint } from './geometry';
import { connectorPoints } from './routing';

function avoids(points: number[], box: { x: number; y: number; width: number; height: number }) {
  for (let i = 2; i < points.length; i += 2) {
    const x1 = points[i - 2] as number;
    const y1 = points[i - 1] as number;
    const x2 = points[i] as number;
    const y2 = points[i + 1] as number;
    expect(x1 === x2 || y1 === y2).toBe(true);
    const crosses =
      x1 === x2
        ? x1 > box.x &&
          x1 < box.x + box.width &&
          Math.max(y1, y2) > box.y &&
          Math.min(y1, y2) < box.y + box.height
        : y1 > box.y &&
          y1 < box.y + box.height &&
          Math.max(x1, x2) > box.x &&
          Math.min(x1, x2) < box.x + box.width;
    expect(crosses, `segment ${x1},${y1} → ${x2},${y2}`).toBe(false);
  }
}

describe('связи обходят контент', () => {
  it('новая стрелка обходит блок с отступом и сохраняет привязки', () => {
    const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'));
    const wall = { ...shape('wall', 200, -40), height: 140 };
    const points = connectorPoints(
      link,
      doc([shape('a'), shape('b', 400), wall, link]),
    ) as number[];
    expect(points.slice(0, 2)).toEqual([100, 30]);
    expect(points.slice(-2)).toEqual([400, 30]);
    avoids(points, { x: 190, y: -50, width: 120, height: 160 });
    avoids(points, shape('a'));
    avoids(points, shape('b', 400));
  });

  it('обходит несколько препятствий, включая блок на пути первого обхода', () => {
    const walls = [
      { ...shape('wall', 190, -40), width: 100, height: 140 },
      { ...shape('upper', 120, -110), width: 220, height: 50 },
      { ...shape('lower', 300, 65), width: 70, height: 150 },
    ];
    const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'));
    const points = connectorPoints(
      link,
      doc([shape('a'), shape('b', 450), ...walls, link]),
    ) as number[];
    for (const wall of walls) avoids(points, wall);
  });

  it('учитывает текст, картинки, стикеры и поворот препятствия', () => {
    const base = shape('wall', 220, -30);
    const obstacles: BoxNode[] = [
      {
        ...base,
        type: 'text',
        text: { value: 'Правила', fontSize: 16, color: '#000', align: 'left' },
        autoWidth: false,
      },
      {
        ...base,
        type: 'sticky',
        fill: '#fff',
        text: { value: 'Идея', fontSize: 16, color: '#000', align: 'left' },
      },
      { ...base, type: 'image', blobId: 'image', naturalWidth: 100, naturalHeight: 60 },
      { ...base, rotation: 90 },
    ];
    for (const obstacle of obstacles) {
      const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'));
      const points = connectorPoints(
        link,
        doc([shape('a'), shape('b', 400), obstacle, link]),
      ) as number[];
      avoids(
        points,
        obstacle.rotation === 90
          ? { x: 160, y: -30, width: 60, height: 100 }
          : (obstacle as BoxNode),
      );
    }
  });

  it('маршрут обновляется после перемещения и удаления препятствия', () => {
    const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'));
    const document = doc([shape('a'), shape('b', 400), shape('wall', 200, 200), link]);
    expect(connectorPoints(link, document)).toEqual([100, 30, 400, 30]);
    document.nodes.wall = shape('wall', 200, 0);
    avoids(connectorPoints(link, document) as number[], shape('wall', 200, 0));
    delete document.nodes.wall;
    expect(connectorPoints(link, document)).toEqual([100, 30, 400, 30]);
  });

  it('рамка группы не перекрывает связи между её участниками', () => {
    const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'));
    const group: Node = {
      ...shape('group', -20, -20),
      type: 'group',
      width: 540,
      height: 100,
      children: ['a', 'b'],
    };
    expect(connectorPoints(link, doc([shape('a'), shape('b', 400), group, link]))).toEqual([
      100, 30, 400, 30,
    ]);
  });
});

it('несколько десятков разных плотных раскладок не пересекают блоки', () => {
  let seed = 7;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let layout = 0; layout < 32; layout += 1) {
    const walls = Array.from({ length: 12 }, (_, i) => ({
      ...shape(`wall-${i}`, 130 + Math.floor(random() * 270), -160 + Math.floor(random() * 320)),
      width: 30 + Math.floor(random() * 50),
      height: 30 + Math.floor(random() * 80),
    }));
    const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'));
    const points = connectorPoints(
      link,
      doc([shape('a'), shape('b', 500), ...walls, link]),
    ) as number[];
    for (const wall of walls) avoids(points, wall);
    avoids(points, shape('a'));
    avoids(points, shape('b', 500));
  }
});

it('дальний контент не меняет маршрут, явные straight и curve сохраняются', () => {
  const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'));
  const wall = shape('wall', 200);
  const nearby = [shape('a'), shape('b', 400), wall, link];
  const distant = Array.from({ length: 2000 }, (_, i) => shape(`far-${i}`, 1000 + i * 100, 1000));
  expect(connectorPoints(link, doc([...nearby, ...distant]))).toEqual(
    connectorPoints(link, doc(nearby)),
  );
  expect(connectorPoints({ ...link, routing: 'straight' }, doc(nearby))).toEqual([
    100, 30, 400, 30,
  ]);
  expect(connectorPoints({ ...link, routing: 'curve' }, doc(nearby))).toHaveLength(8);
});

it('рамка раздела не мешает связи, перекрытый конец даёт конечный маршрут', () => {
  const section = {
    ...shape('section', -20, -20),
    width: 600,
    height: 200,
    design: {
      kind: 'section' as const,
      title: 'Раздел',
      description: '',
      children: ['a', 'b'],
      collapsed: false,
      readingOrder: 0,
    },
  };
  const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'));
  expect(connectorPoints(link, doc([shape('a'), shape('b', 400), section, link]))).toEqual([
    100, 30, 400, 30,
  ]);
  const points = connectorPoints(
    link,
    doc([shape('a'), shape('b', 400), shape('overlap', 80), shape('wall', 230), link]),
  ) as number[];
  expect(points.every(Number.isFinite)).toBe(true);
  avoids(points, shape('wall', 230));
});

it('скрытые участники свёрнутого раздела не притягивают стрелку и не мешают маршруту', () => {
  const section = {
    ...shape('section', 150, -20),
    width: 240,
    height: 160,
    design: {
      kind: 'section' as const,
      title: 'Раздел',
      description: '',
      children: ['wall'],
      collapsed: true,
      readingOrder: 0,
    },
  };
  const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'));
  const document = doc([shape('a'), shape('b', 400), section, shape('wall', 200), link]);
  expect(endpointAt(document, { x: 250, y: 30 }, 1)).toEqual({ point: { x: 250, y: 30 } });
  expect(endpointAt(document, { x: 310, y: 30 }, 1)).toEqual({ point: { x: 310, y: 30 } });
  expect(connectorPoints(link, document)).toEqual([100, 30, 400, 30]);
  section.design.collapsed = false;
  expect(endpointAt(document, { x: 250, y: 30 }, 1).nodeId).toBe('wall');
  avoids(connectorPoints(link, document) as number[], shape('wall', 200));
});
