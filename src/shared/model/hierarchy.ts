import type { BoardDocument, Id } from '@/shared/types/document';

export function withGroupDescendants(document: BoardDocument, ids: Iterable<Id>): Id[] {
  const result: Id[] = [];
  const seen = new Set<Id>();

  const visit = (id: Id): void => {
    if (seen.has(id)) return;
    seen.add(id);
    result.push(id);

    const node = document.nodes[id];
    if (node?.type === 'group') for (const child of node.children) visit(child);
  };

  for (const id of ids) visit(id);
  return result;
}
