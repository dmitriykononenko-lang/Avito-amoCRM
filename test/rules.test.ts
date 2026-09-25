import { describe, expect, it } from 'vitest';
import { amoCallStatus, conversationId, decideLead, pickResponsible, routeAvitoMessage } from '../src/domain/rules.js';

describe('Правило «новая или существующая сделка»', () => {
  it('Given открытая сделка по тому же объявлению, When новое сообщение, Then пишем в неё', () => {
    expect(decideLead([{ id: 10, itemId: 555, closed: false }], 555)).toEqual({ action: 'attach', leadId: 10 });
  });
  it('Given открытая сделка по другому объявлению, Then новая сделка', () => {
    expect(decideLead([{ id: 10, itemId: 111, closed: false }], 555)).toEqual({ action: 'create' });
  });
  it('Given все сделки закрыты, Then новая сделка', () => {
    expect(decideLead([{ id: 10, itemId: 555, closed: true }], 555)).toEqual({ action: 'create' });
  });
  it('Given несколько открытых по объявлению, Then самая свежая', () => {
    const leads = [
      { id: 10, itemId: 555, closed: false },
      { id: 42, itemId: 555, closed: false },
    ];
    expect(decideLead(leads, 555)).toEqual({ action: 'attach', leadId: 42 });
  });
  it('Given у контакта нет сделок, Then новая сделка', () => {
    expect(decideLead([], null)).toEqual({ action: 'create' });
  });
});

describe('Ответственный', () => {
  it('переопределение по объявлению важнее настройки аккаунта', () => {
    expect(pickResponsible(555, new Map([[555, 7]]), 1)).toBe(7);
    expect(pickResponsible(556, new Map([[555, 7]]), 1)).toBe(1);
    expect(pickResponsible(null, new Map(), null)).toBeNull();
  });
});

describe('Защита от зацикливания', () => {
  it('сообщение покупателя → входящее', () => {
    expect(routeAvitoMessage({ authorId: 2, sellerUserId: 1, alreadyMapped: false }).route).toBe('import_incoming');
  });
  it('эхо нашего ответа из amoCRM → пропускаем', () => {
    expect(routeAvitoMessage({ authorId: 1, sellerUserId: 1, alreadyMapped: true }).route).toBe('skip_echo');
  });
  it('ответ продавца из приложения Avito → исходящее в amoCRM', () => {
    expect(routeAvitoMessage({ authorId: 1, sellerUserId: 1, alreadyMapped: false }).route).toBe('import_outgoing');
  });
});

describe('Вспомогательное', () => {
  it('conversation_id включает аккаунт Avito', () => {
    expect(conversationId(123, 'u2i-abc')).toBe('avito:123:u2i-abc');
  });
  it('статус звонка', () => {
    expect(amoCallStatus(35)).toBe(4);
    expect(amoCallStatus(0)).toBe(6);
  });
});
