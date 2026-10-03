/* biome-ignore-all lint/suspicious/noArrayIndexKey: Table rows and columns are ordered arrays without identity in the document contract. */
import { BookOpen, History, X } from 'lucide-react';
import { AlertDialog, Dialog } from 'radix-ui';
import { memo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { downloadUrl, safeFilename } from '@/features/export/lib/download';
import { withGroupDescendants } from '@/shared/model/hierarchy';
import { CARD_TYPES, DESIGN_STATUSES, RELATION_TYPES } from '@/shared/types/design';
import type { BoardDocument, BoardVersion } from '@/shared/types/document';
import { deleteVersion, restoreVersion, saveVersion } from '../actions';
import {
  getSections,
  isCard,
  isReference,
  isSection,
  nodeTitle,
  resolveCard,
  toDesignMarkdown,
} from '../model';
import { Field, IMPLEMENTATION_LABELS, useDesignDocument } from './common';
import '../design.css';

const ReadingNode = ({ document, id }: { document: BoardDocument; id: string }) => {
  const node = document.nodes[id];
  if (!node) return null;
  if (isReference(node)) {
    const target = resolveCard(document, id);
    return (
      <p className="design-read-reference">
        ↗{' '}
        {target ? (
          <a href={`#design-read-${target.id}`}>{target.design.title}</a>
        ) : (
          'Удалённая карточка'
        )}
      </p>
    );
  }
  if (!isCard(node)) {
    if (node.type === 'connector' || node.type === 'group' || isSection(node)) return null;
    const content =
      node.type === 'text' || node.type === 'sticky'
        ? node.text.value
        : node.type === 'shape'
          ? node.label?.value
          : '';
    return content ? <p className="design-prose">{content}</p> : null;
  }
  const d = node.design;
  const backlinks = Object.values(document.nodes)
    .filter(isCard)
    .filter((n) => n.design.references.includes(id));
  const links = Object.values(document.nodes).filter(
    (n) =>
      n.type === 'connector' &&
      n.relation &&
      (resolveCard(document, n.from.nodeId ?? '')?.id === id ||
        resolveCard(document, n.to.nodeId ?? '')?.id === id),
  );
  return (
    <article className="design-reading-card" id={`design-read-${id}`}>
      <p className="label-caps">{CARD_TYPES[d.cardType]}</p>
      <h3>{d.title || 'Без названия'}</h3>
      <div className="design-read-meta">
        <span>{DESIGN_STATUSES[d.status]}</span>
        <span>{IMPLEMENTATION_LABELS[d.implementation]}</span>
        {d.tags.map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
      {d.summary && <p className="design-prose">{d.summary}</p>}
      {Object.entries(d.fields).map(([label, value]) => (
        <section key={label}>
          <h4>{label}</h4>
          <p className="design-prose">{value || '—'}</p>
        </section>
      ))}
      {d.table.columns.length > 0 && (
        <div className="design-table-scroll">
          <table className="design-table">
            <caption>Параметры</caption>
            <thead>
              <tr>
                {d.table.columns.map((c, i) => (
                  <th scope="col" key={i}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.table.rows.map((row, i) => (
                <tr key={i}>
                  {d.table.columns.map((_, j) => (
                    <td key={j}>{row[j] || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.references.length > 0 && (
        <section>
          <h4>Ссылки</h4>
          {d.references.map((ref) => (
            <p key={ref}>
              {resolveCard(document, ref) ? (
                <a href={`#design-read-${resolveCard(document, ref)?.id}`}>
                  {nodeTitle(document, ref)}
                </a>
              ) : (
                'Удалённая карточка'
              )}
            </p>
          ))}
        </section>
      )}
      {backlinks.length > 0 && (
        <section>
          <h4>Обратные ссылки</h4>
          {backlinks.map((n) => (
            <p key={n.id}>
              <a href={`#design-read-${n.id}`}>{n.design.title}</a>
            </p>
          ))}
        </section>
      )}
      {links.length > 0 && (
        <section>
          <h4>Связи</h4>
          {links.map((link) => {
            if (link.type !== 'connector' || !link.relation) return null;
            const outgoing = resolveCard(document, link.from.nodeId ?? '')?.id === id;
            const other = (outgoing ? link.to.nodeId : link.from.nodeId) ?? '';
            const target = resolveCard(document, other);
            return (
              <p key={link.id}>
                {outgoing ? '→' : '←'} {RELATION_TYPES[link.relation]}:{' '}
                {target ? (
                  <a href={`#design-read-${target.id}`}>{target.design.title}</a>
                ) : (
                  nodeTitle(document, other)
                )}
              </p>
            );
          })}
        </section>
      )}
      {d.comments.length > 0 && (
        <section>
          <h4>Обсуждение</h4>
          {d.comments.map((c) => (
            <blockquote className="design-comment" key={c.id}>
              <p className="design-prose">{c.text}</p>
              <footer>
                {c.author} · {new Date(c.createdAt).toLocaleString('ru-RU')} ·{' '}
                {c.resolved ? 'Решено' : 'Открыто'}
              </footer>
            </blockquote>
          ))}
        </section>
      )}
    </article>
  );
};

const ReadDocument = ({ document }: { document: BoardDocument }) => {
  const sections = getSections(document);
  const assigned = new Set<string>();
  const members = new Map(
    sections.map((section) => [
      section.id,
      withGroupDescendants(document, section.design.children).filter((id) => {
        if (assigned.has(id)) return false;
        assigned.add(id);
        return true;
      }),
    ]),
  );
  const loose = document.order.filter((id) => !assigned.has(id) && !isSection(document.nodes[id]));
  return (
    <div className="design-reading-layout">
      <nav aria-label="Навигация чтения" className="design-reading-nav">
        <p className="label-caps">Содержание</p>
        {sections.map((s, i) => (
          <a key={s.id} href={`#design-read-section-${s.id}`}>
            <span className="design-order">{String(i + 1).padStart(2, '0')}</span>
            {s.design.title}
          </a>
        ))}
        {loose.length > 0 && <a href="#design-read-unsectioned">Без раздела</a>}
      </nav>
      <div className="design-reading-body">
        {sections.map((s) => (
          <section key={s.id} id={`design-read-section-${s.id}`} className="design-reading-section">
            <h2>{s.design.title || 'Без названия'}</h2>
            {s.design.description && (
              <p className="design-prose design-muted">{s.design.description}</p>
            )}
            {members.get(s.id)?.map((id) => (
              <ReadingNode key={id} id={id} document={document} />
            ))}
          </section>
        ))}
        {loose.length > 0 && (
          <section id="design-read-unsectioned" className="design-reading-section">
            <h2>Без раздела</h2>
            {loose.map((id) => (
              <ReadingNode key={id} id={id} document={document} />
            ))}
          </section>
        )}
        {document.order.length === 0 && (
          <p className="design-muted">Документ пока пуст. Добавьте карточку или шаблон на холст.</p>
        )}
      </div>
    </div>
  );
};

const Versions = () => {
  const document = useDesignDocument();
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const confirmationOpener = useRef<HTMLButtonElement | null>(null);
  const nameInput = useRef<HTMLInputElement | null>(null);
  const [confirm, setConfirm] = useState<{
    version: BoardVersion;
    action: 'restore' | 'delete';
  } | null>(null);
  if (!document) return null;
  const versions = document.versions ?? [];
  const shown = versions.find((v) => v.id === preview);
  return (
    <div className="design-stack">
      <form
        className="design-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (saveVersion(name)) {
            setName('');
            toast.success('Версия сохранена');
          } else
            toast.error('Не удалось сохранить версию', {
              description: 'Укажите название; можно хранить до 10 версий.',
            });
        }}
      >
        <div className="design-grow">
          <Field label="Название версии">
            <input
              ref={nameInput}
              value={name}
              maxLength={240}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, перед плейтестом"
            />
          </Field>
        </div>
        <button
          type="submit"
          className="design-button is-primary"
          disabled={!name.trim() || versions.length >= 10}
        >
          Сохранить версию
        </button>
      </form>
      <p className="design-muted">
        {versions.length} из 10 версий. Снимок содержит объекты и фон; текущий вид холста
        сохраняется при восстановлении.
      </p>
      {versions.length === 0 && (
        <p className="design-empty">Сохраните первый этап проекта, чтобы вернуться к нему позже.</p>
      )}
      {[...versions].reverse().map((v) => (
        <article className="design-version" key={v.id}>
          <div className="design-row">
            <div className="design-grow">
              <h3>{v.name}</h3>
              <p className="design-muted">
                <time dateTime={new Date(v.createdAt).toISOString()}>
                  {new Date(v.createdAt).toLocaleString('ru-RU')}
                </time>{' '}
                · {v.snapshot.order.length} объектов
              </p>
            </div>
          </div>
          <div className="design-row">
            <button
              type="button"
              className="design-button"
              aria-label={`Просмотреть ${v.name}`}
              aria-expanded={preview === v.id}
              onClick={() => setPreview(preview === v.id ? null : v.id)}
            >
              Просмотр
            </button>
            <button
              type="button"
              className="design-button"
              aria-label={`Восстановить ${v.name}`}
              onClick={(e) => {
                confirmationOpener.current = e.currentTarget;
                setConfirm({ version: v, action: 'restore' });
              }}
            >
              Восстановить
            </button>
            <button
              type="button"
              className="design-link is-danger"
              aria-label={`Удалить версию ${v.name}`}
              onClick={(e) => {
                confirmationOpener.current = e.currentTarget;
                setConfirm({ version: v, action: 'delete' });
              }}
            >
              Удалить
            </button>
          </div>
        </article>
      ))}
      {shown && (
        <section className="design-version-preview">
          <h3>Просмотр: {shown.name}</h3>
          <ReadDocument document={{ ...document, ...shown.snapshot }} />
        </section>
      )}
      <AlertDialog.Root
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="design-overlay" />
          <AlertDialog.Content
            onKeyDown={(event) => event.stopPropagation()}
            onCopy={(event) => event.stopPropagation()}
            onPaste={(event) => event.stopPropagation()}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setConfirm(null);
            }}
            className="design-dialog design-confirm"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              (confirmationOpener.current?.isConnected
                ? confirmationOpener.current
                : nameInput.current
              )?.focus();
            }}
          >
            <AlertDialog.Title>
              {confirm?.action === 'restore' ? 'Восстановить версию?' : 'Удалить версию?'}
            </AlertDialog.Title>
            <AlertDialog.Description>
              {confirm?.action === 'restore'
                ? `Версия «${confirm.version.name}» заменит содержимое холста. Перед этим будет сохранён страховочный снимок текущего состояния.${versions.length >= 10 ? ' При заполненном хранилище самая старая версия будет удалена.' : ''}`
                : `Снимок «${confirm?.version.name}» будет удалён. Текущий холст останется прежним.`}
            </AlertDialog.Description>
            <div className="design-row">
              <AlertDialog.Cancel className="design-button">Отмена</AlertDialog.Cancel>
              <AlertDialog.Action
                className="design-button is-primary"
                aria-label={
                  confirm?.action === 'restore'
                    ? 'Подтвердить восстановление'
                    : 'Подтвердить удаление версии'
                }
                onClick={() => {
                  if (!confirm) return;
                  if (confirm.action === 'restore') {
                    restoreVersion(confirm.version.id);
                    toast.success('Версия восстановлена. Страховочный снимок сохранён.');
                  } else {
                    deleteVersion(confirm.version.id);
                    if (preview === confirm.version.id) setPreview(null);
                  }
                  setConfirm(null);
                }}
              >
                {confirm?.action === 'restore' ? 'Восстановить' : 'Удалить'}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
};

type DesignToolsProps = { name: string; readOnly?: boolean };

export const DesignTools = memo(({ name, readOnly = false }: DesignToolsProps) => {
  const document = useDesignDocument();
  const [open, setOpen] = useState<'read' | 'versions' | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  if (!document) return null;
  const download = () => {
    try {
      const url = URL.createObjectURL(
        new Blob([toDesignMarkdown(document, name)], { type: 'text/markdown;charset=utf-8' }),
      );
      downloadUrl(url, `${safeFilename(name)}.md`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('Не удалось скачать Markdown');
    }
  };
  return (
    <div className="design-tools">
      <button
        type="button"
        className="design-button"
        onClick={(e) => {
          opener.current = e.currentTarget;
          setOpen('read');
        }}
      >
        <BookOpen size={14} aria-hidden="true" />
        Читать диздок
      </button>
      {!readOnly && (
        <button
          type="button"
          className="design-button"
          onClick={(e) => {
            opener.current = e.currentTarget;
            setOpen('versions');
          }}
        >
          <History size={14} aria-hidden="true" />
          Версии
        </button>
      )}
      <Dialog.Root
        open={open !== null && (open !== 'versions' || !readOnly)}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="design-overlay" />
          <Dialog.Content
            onKeyDown={(event) => event.stopPropagation()}
            onCopy={(event) => event.stopPropagation()}
            onPaste={(event) => event.stopPropagation()}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(null);
            }}
            className={`design-dialog ${open === 'read' ? 'design-reader' : ''}`}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              opener.current?.focus();
            }}
          >
            <header className="design-dialog-heading">
              <div>
                <Dialog.Title>{open === 'read' ? name : 'Именованные версии'}</Dialog.Title>
                <Dialog.Description>
                  {open === 'read'
                    ? 'Режим чтения · тот же документ, в порядке разделов.'
                    : 'Контрольные точки проекта: просматривайте и восстанавливайте сохранённые состояния.'}
                </Dialog.Description>
              </div>
              <Dialog.Close className="design-icon" aria-label="Закрыть">
                <X size={18} />
              </Dialog.Close>
            </header>
            {open === 'read' ? (
              <>
                <div className="design-read-actions">
                  <button type="button" className="design-button" onClick={download}>
                    Скачать Markdown
                  </button>
                </div>
                <ReadDocument document={document} />
              </>
            ) : (
              <Versions />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
});
