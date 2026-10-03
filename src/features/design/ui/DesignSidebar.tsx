import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { memo, useState } from 'react';
import { useBoardStore } from '@/shared/store/board';
import {
  CARD_TYPES,
  type CardType,
  DESIGN_STATUSES,
  type DesignStatus,
} from '@/shared/types/design';
import { focusNode, insertCard, insertSection, insertTemplate, patchSection } from '../actions';
import { getSections, isCard, isSection, nodeTitle, resolveCard, searchDesign } from '../model';
import { TEMPLATE_LABELS, type TemplateId } from '../templates';
import { Field, Options, useDesignDocument } from './common';
import '../design.css';

export const DesignSidebar = memo(() => {
  const document = useDesignDocument();
  const selected = useBoardStore((s) => s.selection);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<CardType | ''>('');
  const [status, setStatus] = useState<DesignStatus | ''>('');
  const [tag, setTag] = useState('');
  const [newType, setNewType] = useState<CardType>('concept');
  const [template, setTemplate] = useState<TemplateId>('concept');
  if (!document) return null;
  if (collapsed)
    return (
      <aside className="design-sidebar is-collapsed" aria-label="Диздок">
        <button
          className="design-icon"
          type="button"
          aria-label="Развернуть диздок"
          onClick={() => setCollapsed(false)}
        >
          <ChevronRight size={16} />
        </button>
      </aside>
    );
  const sections = getSections(document);
  const tags = [
    ...new Set(
      Object.values(document.nodes)
        .filter(isCard)
        .flatMap((n) => n.design.tags),
    ),
  ].sort();
  const filtering = !!(query.trim() || type || status || tag);
  const matches = filtering
    ? searchDesign(document, query, type || undefined, status || undefined).filter(
        (n) => !tag || resolveCard(document, n.id)?.design.tags.includes(tag),
      )
    : [];
  const section =
    selected.length === 1 && isSection(document.nodes[selected[0] ?? '']) ? selected[0] : undefined;
  return (
    <aside className="design-sidebar" aria-label="Диздок">
      <header className="design-panel-heading">
        <span className="label-caps">Диздок</span>
        <button
          type="button"
          className="design-icon"
          aria-label="Свернуть диздок"
          onClick={() => setCollapsed(true)}
        >
          <ChevronLeft size={16} />
        </button>
      </header>
      <div className="design-stack">
        <div className="design-search">
          <Search size={14} aria-hidden="true" />
          <input
            aria-label="Поиск по диздоку"
            type="search"
            placeholder="Найти в проекте…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="design-two">
          <select
            aria-label="Фильтр по типу"
            value={type}
            onChange={(e) => setType(e.target.value as CardType | '')}
          >
            <option value="">Все типы</option>
            <Options values={CARD_TYPES} />
          </select>
          <select
            aria-label="Фильтр по статусу"
            value={status}
            onChange={(e) => setStatus(e.target.value as DesignStatus | '')}
          >
            <option value="">Все статусы</option>
            <Options values={DESIGN_STATUSES} />
          </select>
        </div>
        {tags.length > 0 && (
          <select aria-label="Фильтр по тегу" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Все теги</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {filtering && (
          <section className="design-stack">
            <div className="design-row">
              <h3 className="label-caps">Найдено: {matches.length}</h3>
              <button
                type="button"
                className="design-link"
                onClick={() => {
                  setQuery('');
                  setType('');
                  setStatus('');
                  setTag('');
                }}
              >
                Сбросить
              </button>
            </div>
            {matches.length === 0 && (
              <p className="design-muted">Совпадений нет. Попробуйте другой запрос.</p>
            )}
            {matches.map((n) => (
              <button
                type="button"
                className="design-outline-item"
                key={n.id}
                aria-label={`Открыть: ${nodeTitle(document, n.id)}`}
                onClick={() => focusNode(n.id)}
              >
                {nodeTitle(document, n.id)}
              </button>
            ))}
          </section>
        )}
        <section className="design-stack design-divider">
          <h3 className="label-caps">Добавить</h3>
          <Field label="Тип новой карточки">
            <select value={newType} onChange={(e) => setNewType(e.target.value as CardType)}>
              <Options values={CARD_TYPES} />
            </select>
          </Field>
          <button
            type="button"
            className="design-button is-primary"
            onClick={() => insertCard(newType, section)}
          >
            <Plus size={14} aria-hidden="true" />
            Добавить карточку
          </button>
          <button type="button" className="design-button" onClick={() => insertSection()}>
            Раздел из выделенного
          </button>
          <details>
            <summary>Готовый шаблон</summary>
            <div className="design-stack">
              <Field label="Шаблон">
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as TemplateId)}
                >
                  <Options values={TEMPLATE_LABELS} />
                </select>
              </Field>
              <button
                type="button"
                className="design-button"
                onClick={() => insertTemplate(template)}
              >
                Вставить шаблон
              </button>
              <p className="design-muted">Обычные карточки и связи — всё можно менять.</p>
            </div>
          </details>
        </section>
        <nav className="design-stack design-divider" aria-label="Оглавление диздока">
          <div className="design-row">
            <h3 className="label-caps">Разделы</h3>
            <span className="design-muted">{sections.length}</span>
          </div>
          {sections.length === 0 && (
            <p className="design-muted">
              Выделите карточки и объедините их в раздел. Здесь появится оглавление.
            </p>
          )}
          {sections.map((s, i) => (
            <div key={s.id}>
              <div className="design-row">
                <button
                  type="button"
                  className="design-icon"
                  aria-label={`${s.design.collapsed ? 'Развернуть' : 'Свернуть'} раздел ${s.design.title}`}
                  onClick={() => patchSection(s.id, { collapsed: !s.design.collapsed })}
                >
                  {s.design.collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
                <button
                  type="button"
                  className="design-outline-item"
                  aria-current={selected.includes(s.id) ? 'true' : undefined}
                  onClick={() => focusNode(s.id)}
                >
                  <span className="design-order">{String(i + 1).padStart(2, '0')}</span>
                  {s.design.title || 'Без названия'}
                </button>
                <span className="design-muted">{s.design.children.length}</span>
              </div>
              {!s.design.collapsed && (
                <div className="design-outline-children">
                  {s.design.children.map((id) => (
                    <button
                      type="button"
                      key={id}
                      className="design-outline-item"
                      aria-current={selected.includes(id) ? 'true' : undefined}
                      onClick={() => focusNode(id)}
                    >
                      {nodeTitle(document, id)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
});
