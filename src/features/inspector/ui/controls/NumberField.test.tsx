/**
 * Одна проверка на весь нетривиальный кусок контролов — черновик NumberField.
 * Ломается ровно то, ради чего он написан: досрочное зажатие по min, NaN
 * наружу и подстановка чужого значения вместо «разные».
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NumberField } from './fields';

afterEach(cleanup);

const input = () => screen.getByRole('spinbutton') as HTMLInputElement;

describe('NumberField', () => {
  it('не зажимает по min, пока пользователь печатает', () => {
    const onChange = vi.fn();
    render(<NumberField value={20} onChange={onChange} min={8} />);

    fireEvent.change(input(), { target: { value: '1' } });
    expect(input().value).toBe('1');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input(), { target: { value: '12' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it('зажимает по min/max при коммите', () => {
    const onChange = vi.fn();
    render(<NumberField value={20} onChange={onChange} min={8} max={40} />);

    fireEvent.change(input(), { target: { value: '900' } });
    fireEvent.blur(input());
    expect(onChange).toHaveBeenCalledWith(40);
  });

  it('на пустом и мусорном вводе молчит — NaN наружу не уходит', () => {
    const onChange = vi.fn();
    render(<NumberField value={20} onChange={onChange} />);

    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.blur(input());
    fireEvent.change(input(), { target: { value: 'ой' } });
    fireEvent.blur(input());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('при разных значениях поле пустое с плейсхолдером, а не со значением узла', () => {
    render(<NumberField value={undefined} onChange={vi.fn()} placeholder="разные" />);

    expect(input().value).toBe('');
    expect(input().placeholder).toBe('разные');
  });
});
