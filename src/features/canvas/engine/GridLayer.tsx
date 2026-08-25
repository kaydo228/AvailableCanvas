/**
 * Зона 3 — фоновая точечная сетка.
 *
 * Компонент ничего не знает о сторе: вид и размер канваса приходят пропсами
 * (`GridProps` из contract.ts), наружу он ничего не отдаёт. Вся математика —
 * в grid.ts, здесь только отрисовка.
 *
 * Как встраивать: прямым ребёнком `<Stage>`, ПЕРВЫМ слоем, без трансформаций.
 *
 *   <Stage width={size.width} height={size.height}>
 *     <GridLayer viewport={viewport} size={size} />
 *     <Layer scaleX={viewport.zoom} ... >{содержимое доски}</Layer>
 *   </Stage>
 *
 * Слой сетки намеренно НЕ масштабируется вьюпортом: точки считаются сразу
 * в экранных координатах, поэтому их размер не зависит от зума — иначе на
 * четырёхкратном приближении вместо точек были бы кляксы.
 */

import { useMemo } from 'react';
import { Layer, Shape } from 'react-konva';

import type { GridProps } from './contract';
import { computeGridLayout, DEFAULT_GRID_COLOR, DEFAULT_GRID_STEP } from './grid';

/** Сторона точки в экранных пикселях. Не зависит от зума — см. шапку файла. */
const DOT_SIZE = 2;
const DOT_OFFSET = DOT_SIZE / 2;

export const GridLayer = ({
  viewport,
  size,
  step = DEFAULT_GRID_STEP,
  color = DEFAULT_GRID_COLOR,
}: GridProps) => {
  // Раскладка пересчитывается только при смене вида, размера или шага.
  // Зависимости — примитивы, а не объекты: `viewport` и `size` прилетают
  // новыми объектами на каждый рендер родителя, по ним мемоизация была бы
  // холостой.
  // biome-ignore lint/correctness/useExhaustiveDependencies: примитивы намеренно, см. комментарий выше
  const layout = useMemo(
    () => computeGridLayout(viewport, size, step),
    [viewport.x, viewport.y, viewport.zoom, size.width, size.height, step],
  );

  return (
    // listening={false} — сетка вне hit-test: Konva не строит для слоя
    // hit-канвас, клики и наведение проваливаются сквозь неё к содержимому.
    <Layer listening={false}>
      <Shape
        listening={false}
        // Отрисовка без промежуточного буфера: буфер нужен только для
        // «идеальной» композиции заливки со штрихом, а у нас голая заливка.
        perfectDrawEnabled={false}
        fill={color}
        // ПОЧЕМУ ОДИН Shape, А НЕ ТЫСЯЧИ <Circle>.
        //
        // Каждый <Circle> — это узел Konva: собственный объект с атрибутами,
        // кэшем трансформаций и местом в дереве, плюс отдельный вызов
        // отрисовки. На 15–20 тысячах точек это десятки мегабайт мусора и
        // кадр, который не укладывается ни в какие 16 мс, причём пересобирать
        // дерево пришлось бы на каждом шаге панорамирования.
        //
        // Здесь весь фон — ОДИН узел. Точки набиваются в ОДИН путь
        // (ctx.rect не рисует, а только добавляет прямоугольник к пути),
        // и всё это закрашивается ОДНОЙ заливкой.
        //
        // Konva.Line с массивом точек не подошла: это ломаная, она соединяет
        // точки линией; чтобы получить из неё точки, пришлось бы городить
        // нулевые сегменты с круглым lineCap — трюк, который стоит дороже
        // и читается хуже.
        //
        // Точка — квадрат 2×2 px, а не окружность: на таком размере разницы
        // на экране нет, а ctx.arc на каждую точку заметно дороже ctx.rect.
        sceneFunc={(ctx, shape) => {
          const { columns, rows, visible } = layout;
          if (!visible || columns.length === 0 || rows.length === 0) return;

          const { zoom, x: originX, y: originY } = viewport;

          // Экранная координата считается по той же формуле, что и во всём
          // движке: screen = world * zoom + {x, y}. Колонки переводятся один
          // раз: их X не зависит от строки, а во внутреннем цикле эта пара
          // умножений повторилась бы десятки тысяч раз.
          const screenX = new Float64Array(columns.length);
          let column = 0;
          for (const worldX of columns) {
            screenX[column] = worldX * zoom + originX - DOT_OFFSET;
            column += 1;
          }

          ctx.beginPath();
          for (const worldY of rows) {
            const y = worldY * zoom + originY - DOT_OFFSET;
            for (const x of screenX) {
              ctx.rect(x, y, DOT_SIZE, DOT_SIZE);
            }
          }
          // Заливка берётся из fill самого Shape — один вызов на весь фон.
          ctx.fillStrokeShape(shape);
        }}
      />
    </Layer>
  );
};
