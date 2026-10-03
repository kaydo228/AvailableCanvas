/* biome-ignore-all lint/suspicious/noArrayIndexKey: Table rows and columns are ordered arrays without identity in the document contract. */
import { nanoid } from 'nanoid';
import { memo, useState } from 'react';
import { useBoardStore } from '@/shared/store/board';
import {
  CARD_TYPES,
  type CardType,
  DESIGN_STATUSES,
  type DesignCard,
  type DesignStatus,
  type ParameterTable,
  RELATION_TYPES,
  type RelationType,
} from '@/shared/types/design';
import type { ShapeNode } from '@/shared/types/document';
import {
  assignSection,
  focusNode,
  insertReference,
  insertRelation,
  patchCard,
  patchSection,
} from '../actions';
import {
  type CardNode,
  getSection,
  getSections,
  isCard,
  isReference,
  isSection,
  nodeTitle,
  resolveCard,
  type SectionNode,
} from '../model';
import { CopyNodeLink, Field, IMPLEMENTATION_LABELS, Options, useDesignDocument } from './common';
import '../design.css';

const Membership = ({ id }: { id: string }) => {
  const document = useDesignDocument();
  if (!document) return null;
  return (
    <Field label="Раздел">
      <select
        value={getSection(document, id)?.id ?? ''}
        onChange={(e) => assignSection(id, e.target.value || null)}
      >
        <option value="">Без раздела</option>
        {getSections(document).map((s) => (
          <option key={s.id} value={s.id}>
            {s.design.title}
          </option>
        ))}
      </select>
    </Field>
  );
};

const SectionEditor = ({ node }: { node: SectionNode }) => {
  const document = useDesignDocument();
  const selection = useBoardStore((s) => s.selection);
  const [member, setMember] = useState('');
  if (!document) return null;
  const d = node.design;
  const available = document.order.filter(
    (id) => id !== node.id && !isSection(document.nodes[id]) && !d.children.includes(id),
  );
  return (
    <div className="design-stack design-inspector">
      <p className="label-caps">Раздел</p>
      <Field label="Название раздела">
        <input
          maxLength={240}
          value={d.title}
          onChange={(e) => patchSection(node.id, { title: e.target.value })}
        />
      </Field>
      <Field label="Описание раздела">
        <textarea
          maxLength={10000}
          rows={4}
          value={d.description}
          onChange={(e) => patchSection(node.id, { description: e.target.value })}
        />
      </Field>
      <Field label="Порядок чтения">
        <input
          type="number"
          value={d.readingOrder}
          onChange={(e) => {
            if (e.target.value !== '')
              patchSection(node.id, { readingOrder: Number(e.target.value) });
          }}
        />
      </Field>
      <label className="design-check">
        <input
          type="checkbox"
          checked={d.collapsed}
          onChange={(e) => patchSection(node.id, { collapsed: e.target.checked })}
        />
        Свернуть содержимое на холсте
      </label>
      <section className="design-stack design-divider">
        <h3 className="label-caps">Состав · {d.children.length}</h3>
        {d.children.map((id) => (
          <div className="design-row" key={id}>
            <button className="design-link design-grow" type="button" onClick={() => focusNode(id)}>
              {nodeTitle(document, id)}
            </button>
            <button
              className="design-icon"
              type="button"
              aria-label={`Убрать из раздела: ${nodeTitle(document, id)}`}
              onClick={() => assignSection(id, null)}
            >
              ×
            </button>
          </div>
        ))}
        <Field label="Объект для раздела">
          <select value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="">Выберите объект</option>
            {available.map((id) => (
              <option key={id} value={id}>
                {nodeTitle(document, id)}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className="design-button"
          disabled={!member}
          onClick={() => {
            assignSection(member, node.id);
            setMember('');
          }}
        >
          Добавить в раздел
        </button>
        {selection.some((id) => id !== node.id && !isSection(document.nodes[id])) && (
          <button
            type="button"
            className="design-button"
            onClick={() =>
              selection
                .filter((id) => id !== node.id)
                .forEach((id) => {
                  assignSection(id, node.id);
                })
            }
          >
            Добавить выделенные объекты
          </button>
        )}
      </section>
      <CopyNodeLink id={node.id} />
    </div>
  );
};

const TableEditor = ({
  table,
  onChange,
}: {
  table: ParameterTable;
  onChange: (next: ParameterTable) => void;
}) => (
  <section className="design-stack design-divider">
    <h3 className="label-caps">Параметры</h3>
    {table.columns.length > 0 && (
      <div className="design-table-scroll">
        <table className="design-table">
          <caption className="sr-only">Редактируемая таблица параметров</caption>
          <thead>
            <tr>
              {table.columns.map((column, i) => (
                <th key={i}>
                  <div className="design-row">
                    <input
                      aria-label={`Название колонки ${i + 1}`}
                      value={column}
                      maxLength={240}
                      onChange={(e) =>
                        onChange({
                          ...table,
                          columns: table.columns.map((c, j) => (j === i ? e.target.value : c)),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="design-icon"
                      aria-label={`Удалить колонку ${i + 1}`}
                      onClick={() =>
                        onChange({
                          columns: table.columns.filter((_, j) => j !== i),
                          rows: table.rows.map((row) => row.filter((_, j) => j !== i)),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
              <th>
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {table.columns.map((_, j) => (
                  <td key={j}>
                    <input
                      aria-label={`Строка ${i + 1}, колонка ${j + 1}`}
                      maxLength={10000}
                      value={row[j] ?? ''}
                      onChange={(e) =>
                        onChange({
                          ...table,
                          rows: table.rows.map((r, k) =>
                            k === i
                              ? table.columns.map((_, c) =>
                                  c === j ? e.target.value : (r[c] ?? ''),
                                )
                              : r,
                          ),
                        })
                      }
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="design-icon"
                    aria-label={`Удалить строку ${i + 1}`}
                    onClick={() =>
                      onChange({ ...table, rows: table.rows.filter((_, j) => j !== i) })
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <div className="design-row">
      <button
        type="button"
        className="design-button"
        disabled={table.columns.length >= 20}
        onClick={() =>
          onChange({
            columns: [...table.columns, `Параметр ${table.columns.length + 1}`],
            rows: table.rows.map((r) => [...r, '']),
          })
        }
      >
        Добавить колонку
      </button>
      <button
        type="button"
        className="design-button"
        disabled={!table.columns.length || table.rows.length >= 200}
        onClick={() => onChange({ ...table, rows: [...table.rows, table.columns.map(() => '')] })}
      >
        Добавить строку
      </button>
    </div>
  </section>
);

const CardEditor = ({ node, selectedId }: { node: CardNode; selectedId: string }) => {
  const document = useDesignDocument();
  const removeNodes = useBoardStore((s) => s.removeNodes);
  const [field, setField] = useState('');
  const [reference, setReference] = useState('');
  const [relationTarget, setRelationTarget] = useState('');
  const [relation, setRelation] = useState<RelationType>('related');
  const [author, setAuthor] = useState('');
  const [comment, setComment] = useState('');
  if (!document) return null;
  const d = node.design;
  const patch = (value: Partial<DesignCard>) => patchCard(node.id, value);
  const targets = Object.values(document.nodes)
    .filter(isCard)
    .filter((n) => n.id !== node.id);
  const backlinks = targets.filter((n) => n.design.references.includes(node.id));
  const appearances = Object.values(document.nodes)
    .filter(isReference)
    .filter((n) => n.design.targetId === node.id);
  const links = Object.values(document.nodes).filter(
    (n) =>
      n.type === 'connector' &&
      n.relation &&
      (resolveCard(document, n.from.nodeId ?? '')?.id === node.id ||
        resolveCard(document, n.to.nodeId ?? '')?.id === node.id),
  );
  return (
    <div className="design-stack design-inspector">
      {selectedId !== node.id && (
        <div className="design-notice">
          <p>Представление-ссылка. Изменения сохраняются в оригинале.</p>
          <button type="button" className="design-link" onClick={() => focusNode(node.id)}>
            Открыть оригинал
          </button>
        </div>
      )}
      <Field label="Тип карточки">
        <select
          value={d.cardType}
          onChange={(e) => patch({ cardType: e.target.value as CardType })}
        >
          <Options values={CARD_TYPES} />
        </select>
      </Field>
      <Field label="Название карточки">
        <input value={d.title} maxLength={240} onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <Field label="Краткое описание">
        <textarea
          value={d.summary}
          maxLength={10000}
          rows={4}
          onChange={(e) => patch({ summary: e.target.value })}
        />
      </Field>
      <div className="design-two">
        <Field label="Проверка идеи">
          <select
            value={d.status}
            onChange={(e) => patch({ status: e.target.value as DesignStatus })}
          >
            <Options values={DESIGN_STATUSES} />
          </select>
        </Field>
        <Field label="Реализация">
          <select
            value={d.implementation}
            onChange={(e) =>
              patch({ implementation: e.target.value as DesignCard['implementation'] })
            }
          >
            <Options values={IMPLEMENTATION_LABELS} />
          </select>
        </Field>
      </div>
      <Field label="Теги через запятую">
        <input
          key={d.tags.join(',')}
          defaultValue={d.tags.join(', ')}
          maxLength={1000}
          onBlur={(e) =>
            patch({
              tags: e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          placeholder="бой, прототип"
        />
      </Field>
      <Membership id={selectedId} />
      <section className="design-stack design-divider">
        <h3 className="label-caps">Подробности</h3>
        {Object.entries(d.fields).map(([name, value]) => (
          <div className="design-stack" key={name}>
            <Field label={name}>
              <textarea
                rows={3}
                value={value}
                maxLength={10000}
                onChange={(e) => patch({ fields: { ...d.fields, [name]: e.target.value } })}
              />
            </Field>
            <button
              type="button"
              className="design-link is-danger"
              aria-label={`Удалить поле ${name}`}
              onClick={() =>
                patch({
                  fields: Object.fromEntries(
                    Object.entries(d.fields).filter(([key]) => key !== name),
                  ),
                })
              }
            >
              Удалить поле
            </button>
          </div>
        ))}
        <Field label="Название нового поля">
          <input
            value={field}
            maxLength={120}
            onChange={(e) => setField(e.target.value)}
            placeholder="Например, ограничения"
          />
        </Field>
        <button
          type="button"
          className="design-button"
          disabled={
            !field.trim() ||
            Object.hasOwn(d.fields, field.trim()) ||
            Object.keys(d.fields).length >= 40
          }
          onClick={() => {
            patch({ fields: { ...d.fields, [field.trim()]: '' } });
            setField('');
          }}
        >
          Добавить поле
        </button>
      </section>
      <TableEditor table={d.table} onChange={(table) => patch({ table })} />
      <section className="design-stack design-divider">
        <h3 className="label-caps">Ссылки на карточки</h3>
        {d.references.map((id) => (
          <div className="design-row" key={id}>
            <button
              className="design-link design-grow"
              type="button"
              disabled={!resolveCard(document, id)}
              onClick={() => focusNode(id)}
            >
              {nodeTitle(document, id)}
            </button>
            <button
              className="design-icon"
              type="button"
              aria-label={`Убрать ссылку: ${nodeTitle(document, id)}`}
              onClick={() => patch({ references: d.references.filter((ref) => ref !== id) })}
            >
              ×
            </button>
          </div>
        ))}
        <Field label="Карточка для ссылки">
          <select value={reference} onChange={(e) => setReference(e.target.value)}>
            <option value="">Выберите карточку</option>
            {targets
              .filter((n) => !d.references.includes(n.id))
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.design.title}
                </option>
              ))}
          </select>
        </Field>
        <button
          type="button"
          className="design-button"
          disabled={!reference}
          onClick={() => {
            patch({ references: [...d.references, reference] });
            setReference('');
          }}
        >
          Добавить ссылку на карточку
        </button>
        {backlinks.length > 0 && (
          <>
            <h4 className="design-muted">Ссылаются на эту карточку</h4>
            {backlinks.map((n) => (
              <button
                className="design-link"
                type="button"
                key={n.id}
                onClick={() => focusNode(n.id)}
              >
                {n.design.title}
              </button>
            ))}
          </>
        )}
        <button
          type="button"
          className="design-button"
          onClick={() => insertReference(node.id, getSection(document, selectedId)?.id)}
        >
          Разместить представление-ссылку
        </button>
        {appearances.length > 0 && (
          <details>
            <summary>Представления на холсте · {appearances.length}</summary>
            {appearances.map((n, i) => (
              <button
                className="design-link"
                type="button"
                key={n.id}
                onClick={() => focusNode(n.id)}
              >
                Представление {i + 1}
              </button>
            ))}
          </details>
        )}
      </section>
      <section className="design-stack design-divider">
        <h3 className="label-caps">Смысловые связи</h3>
        {links.map((link) => {
          if (link.type !== 'connector' || !link.relation) return null;
          const outgoing = resolveCard(document, link.from.nodeId ?? '')?.id === node.id;
          const other = (outgoing ? link.to.nodeId : link.from.nodeId) ?? '';
          return (
            <div key={link.id} className="design-row">
              <button
                type="button"
                className="design-link design-grow"
                onClick={() => focusNode(other)}
              >
                <span className="design-muted">
                  {outgoing ? '→' : '←'} {RELATION_TYPES[link.relation]} ·{' '}
                </span>
                {nodeTitle(document, other)}
              </button>
              <button
                className="design-icon"
                type="button"
                aria-label={`Удалить связь с ${nodeTitle(document, other)}`}
                onClick={() => removeNodes([link.id])}
              >
                ×
              </button>
            </div>
          );
        })}
        <Field label="Тип связи">
          <select value={relation} onChange={(e) => setRelation(e.target.value as RelationType)}>
            <Options values={RELATION_TYPES} />
          </select>
        </Field>
        <Field label="Цель связи">
          <select value={relationTarget} onChange={(e) => setRelationTarget(e.target.value)}>
            <option value="">Выберите карточку</option>
            {targets.map((n) => (
              <option key={n.id} value={n.id}>
                {n.design.title}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className="design-button"
          disabled={!relationTarget}
          onClick={() => {
            insertRelation(node.id, relationTarget, relation);
            setRelationTarget('');
          }}
        >
          Создать связь
        </button>
      </section>
      <section className="design-stack design-divider">
        <h3 className="label-caps">Обсуждение · {d.comments.length}</h3>
        {d.comments.map((c) => (
          <article className={`design-comment ${c.resolved ? 'is-resolved' : ''}`} key={c.id}>
            <div className="design-row">
              <strong>{c.author}</strong>
              <time dateTime={new Date(c.createdAt).toISOString()}>
                {new Date(c.createdAt).toLocaleDateString('ru-RU')}
              </time>
            </div>
            <p>{c.text}</p>
            <button
              type="button"
              className="design-link"
              onClick={() =>
                patch({
                  comments: d.comments.map((item) =>
                    item.id === c.id ? { ...item, resolved: !item.resolved } : item,
                  ),
                })
              }
            >
              {c.resolved ? 'Открыть обсуждение снова' : 'Отметить решённым'}
            </button>
            {c.resolved && <span className="design-muted">Решено</span>}
          </article>
        ))}
        <Field label="Автор комментария">
          <input
            value={author}
            maxLength={120}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Ваше имя"
          />
        </Field>
        <Field label="Новый комментарий">
          <textarea
            value={comment}
            rows={3}
            maxLength={10000}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        <button
          type="button"
          className="design-button"
          disabled={!author.trim() || !comment.trim() || d.comments.length >= 200}
          onClick={() => {
            patch({
              comments: [
                ...d.comments,
                {
                  id: nanoid(),
                  author: author.trim(),
                  text: comment.trim(),
                  createdAt: Date.now(),
                  resolved: false,
                },
              ],
            });
            setComment('');
          }}
        >
          Добавить комментарий
        </button>
      </section>
      <CopyNodeLink id={selectedId} />
    </div>
  );
};

export const DesignInspector = memo(({ node }: { node: ShapeNode }) => {
  const document = useDesignDocument();
  if (!document) return null;
  if (isSection(node)) return <SectionEditor key={node.id} node={node} />;
  const card = isReference(node)
    ? resolveCard(document, node.design.targetId)
    : resolveCard(document, node.id);
  if (!card)
    return (
      <div className="design-stack design-inspector">
        <h3>Удалённая карточка</h3>
        <p className="design-muted">
          Оригинал этого представления недоступен. Его можно вернуть отменой удаления или из
          сохранённой версии.
        </p>
        <Membership id={node.id} />
        <CopyNodeLink id={node.id} />
      </div>
    );
  return <CardEditor key={`${node.id}:${card.id}`} node={card} selectedId={node.id} />;
});
