import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { storage } from "@/src/utils/storage";

export interface CartItem {
  product_id: string;
  name: string;
  price: number;
  unit: string;
  qty: number;
  image_url?: string | null;
  company_name: string;
}

interface CartCtx {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartCtx>({
  items: [],
  add: () => {},
  setQty: () => {},
  remove: () => {},
  clear: () => {},
  total: 0,
  count: 0,
});

const CART_KEY = "cart_items_v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string>(CART_KEY, "");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setItems(parsed);
        } catch {}
      }
      setReady(true);
    })();
  }, []);

  const persist = (next: CartItem[]) => {
    storage.setItem(CART_KEY, JSON.stringify(next));
    setItems(next);
  };
  void persist;

  const add = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === item.product_id);
      const next = existing
        ? prev.map((i) => (i.product_id === item.product_id ? { ...i, qty: i.qty + qty } : i))
        : [...prev, { ...item, qty }];
      storage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((prev) => {
      const next = qty <= 0 ? prev.filter((i) => i.product_id !== productId) : prev.map((i) => (i.product_id === productId ? { ...i, qty } : i));
      storage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.product_id !== productId);
      storage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    storage.setItem(CART_KEY, "[]");
  }, []);

  const total = useMemo(() => items.reduce((s, i) => s + i.price * i.qty, 0), [items]);
  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);

  return (
    <CartContext.Provider value={{ items: ready ? items : [], add, setQty, remove, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
