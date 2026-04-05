import type { SplitSession } from '../../types/split.types';
import type { ReceiptItem } from '../../types/receipt.types';
import type { Dispatch, SetStateAction } from 'react';

type Setter = Dispatch<SetStateAction<SplitSession>>;

export function makeItemOperations(setSession: Setter) {
  return {
    updateItem: (id: string, updates: Partial<ReceiptItem>) =>
      setSession((s) => ({
        ...s,
        receiptItems: s.receiptItems.map((item) =>
          item.id === id ? { ...item, ...updates, isEdited: true } : item
        ),
      })),

    deleteItem: (id: string) =>
      setSession((s) => ({
        ...s,
        receiptItems: s.receiptItems.filter((item) => item.id !== id),
        claims: s.claims.filter((c) => c.itemId !== id),
      })),

    addItem: (item: ReceiptItem) =>
      setSession((s) => ({ ...s, receiptItems: [...s.receiptItems, item] })),

    setReceiptItems: (items: ReceiptItem[]) =>
      setSession((s) => ({ ...s, receiptItems: items })),
  };
}
