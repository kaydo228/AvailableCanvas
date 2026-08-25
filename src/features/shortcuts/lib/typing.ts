/**
 * «Пользователь сейчас печатает?» — чистая функция, без React и стора.
 *
 * Ради этой проверки всё и затевалось: без неё слово «view», набранное
 * в стикере, переключает три инструмента подряд.
 *
 * Проверяется не только оверлей холста: в панели свойств есть числовые поля
 * и hex-инпут, и набор «12» в ширине ломался бы ровно так же.
 */

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Поля, где ввода нет: галочка и радиокнопка — это управление, а не набор.
 * На них горячие клавиши должны работать.
 */
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range']);

export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;

  if (!TYPING_TAGS.has(target.tagName)) return false;

  if (target instanceof HTMLInputElement && NON_TEXT_INPUT_TYPES.has(target.type)) return false;

  return true;
};

/**
 * Полная проверка: фокус в поле ввода ИЛИ узел на холсте в режиме правки.
 *
 * Два условия, а не одно, потому что они ловят разные случаи. `editingNodeId`
 * — авторитетный признак режима правки узла, но оверлей может ещё не получить
 * фокус в момент нажатия; фокус в поле панели свойств, наоборот, никак
 * не отражается в `editingNodeId`.
 */
export const isTyping = (event: KeyboardEvent, editingNodeId: string | null): boolean =>
  editingNodeId !== null || isTypingTarget(event.target);
