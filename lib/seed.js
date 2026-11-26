// Default restaurant data used the first time the app starts (or if data/db.json is lost).

export function seedState() {
  const menu = [
    // Starters
    { id: 'm-momos', name: 'Veg Momos (8 pc)', price: 90, category: 'Starters', emoji: '🥟', veg: true, available: true },
    { id: 'm-chilli-potato', name: 'Chilli Potato', price: 120, category: 'Starters', emoji: '🌶️', veg: true, available: true },
    { id: 'm-paneer-tikka', name: 'Paneer Tikka', price: 220, category: 'Starters', emoji: '🍢', veg: true, available: true },
    { id: 'm-lollipop', name: 'Chicken Lollipop', price: 210, category: 'Starters', emoji: '🍗', veg: false, available: true },
    { id: 'm-fries', name: 'French Fries', price: 80, category: 'Starters', emoji: '🍟', veg: true, available: true },

    // Main course
    { id: 'm-pbm', name: 'Paneer Butter Masala', price: 260, category: 'Main Course', emoji: '🍛', veg: true, available: true },
    { id: 'm-dal-tadka', name: 'Dal Tadka', price: 180, category: 'Main Course', emoji: '🥘', veg: true, available: true },
    { id: 'm-veg-biryani', name: 'Veg Biryani', price: 220, category: 'Main Course', emoji: '🍚', veg: true, available: true },
    { id: 'm-chicken-biryani', name: 'Chicken Biryani', price: 290, category: 'Main Course', emoji: '🍖', veg: false, available: true },
    { id: 'm-naan', name: 'Butter Naan', price: 40, category: 'Main Course', emoji: '🫓', veg: true, available: true },
    { id: 'm-roti', name: 'Tandoori Roti', price: 20, category: 'Main Course', emoji: '🫓', veg: true, available: true },

    // Chinese
    { id: 'm-chowmein', name: 'Veg Chowmein', price: 130, category: 'Chinese', emoji: '🍜', veg: true, available: true },
    { id: 'm-fried-rice', name: 'Veg Fried Rice', price: 150, category: 'Chinese', emoji: '🍛', veg: true, available: true },
    { id: 'm-chilli-chicken', name: 'Chilli Chicken', price: 240, category: 'Chinese', emoji: '🍤', veg: false, available: true },

    // Drinks
    { id: 'm-chai', name: 'Masala Chai', price: 30, category: 'Drinks', emoji: '☕', veg: true, available: true },
    { id: 'm-cold-coffee', name: 'Cold Coffee', price: 90, category: 'Drinks', emoji: '🥤', veg: true, available: true },
    { id: 'm-lassi', name: 'Sweet Lassi', price: 70, category: 'Drinks', emoji: '🥛', veg: true, available: true },
    { id: 'm-lime-soda', name: 'Fresh Lime Soda', price: 60, category: 'Drinks', emoji: '🍋', veg: true, available: true },

    // Desserts
    { id: 'm-gulab-jamun', name: 'Gulab Jamun (2 pc)', price: 60, category: 'Desserts', emoji: '🍮', veg: true, available: true },
    { id: 'm-ice-cream', name: 'Vanilla Ice Cream', price: 70, category: 'Desserts', emoji: '🍨', veg: true, available: true }
  ];

  return {
    settings: {
      restaurantName: 'Munger Digital Services',
      tagline: 'Restaurant QR Ordering',
      currency: '₹',
      tables: 12
    },
    menu,
    orders: [],
    seq: { order: 1000 }
  };
}
