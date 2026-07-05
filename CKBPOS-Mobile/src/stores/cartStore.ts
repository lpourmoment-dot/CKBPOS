import { create } from 'zustand';

export interface CartItem {
  productId: number;
  variantId?: number;
  name: string;
  type: 'carton' | 'demi' | 'unite';
  qty: number;
  price: number;
  subtotal: number;
  unitsPerCarton: number;
}

interface CartState {
  items: CartItem[];
  clientNom: string;
  clientNif: string;
  addItem: (item: Omit<CartItem, 'subtotal'>) => void;
  removeItem: (index: number) => void;
  updateQty: (index: number, qty: number) => void;
  clear: () => void;
  setClient: (nom: string, nif: string) => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  clientNom: '',
  clientNif: 'CONSUMIDOR FINAL',

  addItem: (item) => {
    const subtotal = item.qty * item.price;
    set((state) => ({
      items: [...state.items, { ...item, subtotal }],
    }));
  },

  removeItem: (index) => {
    set((state) => ({
      items: state.items.filter((_, i) => i !== index),
    }));
  },

  updateQty: (index, qty) => {
    if (qty <= 0) {
      get().removeItem(index);
      return;
    }
    set((state) => ({
      items: state.items.map((item, i) =>
        i === index
          ? { ...item, qty, subtotal: qty * item.price }
          : item
      ),
    }));
  },

  clear: () => set({ items: [], clientNom: '', clientNif: 'CONSUMIDOR FINAL' }),

  setClient: (nom, nif) => set({ clientNom: nom, clientNif: nif }),

  getTotal: () => get().items.reduce((sum, item) => sum + item.subtotal, 0),

  getItemCount: () => get().items.length,
}));
