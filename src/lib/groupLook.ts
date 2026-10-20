/**
 * Group icons and colours.
 *
 * Icons are small stroke drawings on a 24x24 grid, kept as SVG markup so the same drawing can be shown in the app and
 * rasterised into PDF headers. Colours are a fixed palette of 30 (6 hue families x 5 shades), each dark enough for a
 * white icon to stay readable (3:1 or better) and light enough to stand out on the dark theme.
 */
export const ICONS: Array<{ id: string; label: string; svg: string }> = [
  { id: 'plane', label: 'Plane', svg: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>' },
  { id: 'car', label: 'Car', svg: '<path d="M3 15v-3l2-5h14l2 5v3"/><path d="M3 15h18v3H3z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/><path d="M5 12h14"/>' },
  { id: 'bus', label: 'Bus', svg: '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16"/><path d="M7 21v-3M17 21v-3"/><circle cx="8" cy="14.5" r=".6"/><circle cx="16" cy="14.5" r=".6"/>' },
  { id: 'train', label: 'Train', svg: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14"/><path d="M8 21l2-4M16 21l-2-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>' },
  { id: 'boat', label: 'Boat', svg: '<path d="M12 3v11"/><path d="M12 4l6 8h-6"/><path d="M12 7L7 12h5"/><path d="M3 15h18l-2.5 5h-13z"/>' },
  { id: 'bike', label: 'Bike', svg: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8"/><path d="M10 8L9 6h-2"/><path d="M12 16l3-8"/>' },
  { id: 'tent', label: 'Tent', svg: '<path d="M3 20L12 4l9 16z"/><path d="M12 4v16"/><path d="M12 20l-3-5M12 20l3-5"/>' },
  { id: 'mountain', label: 'Mountain', svg: '<path d="M2 20l7-12 4 7 3-4 6 9z"/><path d="M9 8l1.5 2.5-1.5 1-1.5-1z"/>' },
  { id: 'beach', label: 'Beach', svg: '<circle cx="16" cy="7" r="3"/><path d="M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>' },
  { id: 'map', label: 'Map', svg: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>' },
  { id: 'compass', label: 'Compass', svg: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>' },
  { id: 'suitcase', label: 'Suitcase', svg: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3"/><path d="M3 13h18"/>' },
  { id: 'bed', label: 'Hotel', svg: '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="1.6"/>' },
  { id: 'home', label: 'Home', svg: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>' },
  { id: 'building', label: 'Building', svg: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M11 21v-3h2v3"/>' },
  { id: 'key', label: 'Key', svg: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>' },
  { id: 'sofa', label: 'Sofa', svg: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M6 17v2M18 17v2"/>' },
  { id: 'utensils', label: 'Food', svg: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18"/><path d="M17 21V3c-2.5 1.5-3.5 4-3.5 7 0 2 1 3 3.5 3"/>' },
  { id: 'coffee', label: 'Coffee', svg: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v2M12 3v2"/>' },
  { id: 'glass', label: 'Drinks', svg: '<path d="M5 3h14l-7 10z"/><path d="M12 13v8M8 21h8"/>' },
  { id: 'pizza', label: 'Pizza', svg: '<path d="M3 6c6-4 12-4 18 0L12 21z"/><circle cx="10" cy="9" r="1"/><circle cx="14" cy="10" r="1"/><circle cx="12" cy="14" r="1"/>' },
  { id: 'cart', label: 'Shopping', svg: '<path d="M3 4h2l2 12h11l2-8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>' },
  { id: 'bag', label: 'Bag', svg: '<path d="M5 8h14l1 13H4z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>' },
  { id: 'gift', label: 'Gift', svg: '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8c-1-4-5-4-5-2s3 2 5 2c1-4 5-4 5-2s-3 2-5 2"/>' },
  { id: 'cake', label: 'Cake', svg: '<path d="M4 21h16v-8H4z"/><path d="M4 16c3 2 5-2 8 0s5-2 8 0"/><path d="M12 13V9M12 5.5c1 1.2 1 2 0 3-1-1-1-1.8 0-3z"/>' },
  { id: 'party', label: 'Party', svg: '<path d="M4 21l5-14 10 10z"/><path d="M14 4v2M19 7l-1.5 1M20 13h-2"/><circle cx="17" cy="4" r=".6"/>' },
  { id: 'music', label: 'Music', svg: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>' },
  { id: 'film', label: 'Movies', svg: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>' },
  { id: 'gamepad', label: 'Games', svg: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.500h5"/><circle cx="15.5" cy="11.5" r=".7"/><circle cx="18" cy="13.5" r=".7"/>' },
  { id: 'ticket', label: 'Tickets', svg: '<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/>' },
  { id: 'camera', label: 'Camera', svg: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="3.5"/>' },
  { id: 'heart', label: 'Heart', svg: '<path d="M12 21C4 15 2 11 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 3-2 7-10 13z"/>' },
  { id: 'star', label: 'Star', svg: '<path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.200L12 17.5 5.7 21.500l1.6-7.200L2 9.6 9 9z"/>' },
  { id: 'users', label: 'People', svg: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 15c3 0 5 2 5 5"/>' },
  { id: 'paw', label: 'Pets', svg: '<circle cx="7" cy="10" r="1.8"/><circle cx="11" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="19" cy="10" r="1.8"/><path d="M13 12c-3 0-6 3-6 6 0 2 2 3 3.5 2.5 1.5-.5 3.5-.5 5 0C17 20 19 20 19 18c0-3-3-6-6-6z"/>' },
  { id: 'tree', label: 'Tree', svg: '<path d="M12 3l6 8h-3l4 6H5l4-6H6z"/><path d="M12 17v4"/>' },
  { id: 'leaf', label: 'Garden', svg: '<path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15z"/><path d="M5 19c3-5 6-8 10-10"/>' },
  { id: 'sun', label: 'Sun', svg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>' },
  { id: 'moon', label: 'Night', svg: '<path d="M20 14.500A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.500z"/>' },
  { id: 'snow', label: 'Snow', svg: '<path d="M12 2v20M3.5 7l17 10M3.5 17l17-10"/><path d="M9.5 4L12 6l2.5-2M9.5 20L12 18l2.5 2"/>' },
  { id: 'umbrella', label: 'Rain', svg: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>' },
  { id: 'briefcase', label: 'Work', svg: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>' },
  { id: 'laptop', label: 'Laptop', svg: '<rect x="5" y="5" width="14" height="10" rx="1"/><path d="M2 19h20l-2-4H4z"/>' },
  { id: 'wrench', label: 'Repairs', svg: '<path d="M14.5 6.500a4 4 0 0 0 4.5 4.500L9 21a2.2 2.2 0 0 1-3-3l10-10a4 4 0 0 0-1.5-1.500z"/>' },
  { id: 'book', label: 'Books', svg: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>' },
  { id: 'cap', label: 'School', svg: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.500V16c3 3 9 3 12 0v-4.5"/><path d="M22 9v6"/>' },
  { id: 'dumbbell', label: 'Fitness', svg: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>' },
  { id: 'ball', label: 'Sports', svg: '<circle cx="12" cy="12" r="9"/><path d="M12 8l3.5 2.5-1.3 4h-4.400l-1.3-4z"/><path d="M12 8V3M15.5 10.500L20 9M14.2 14.500L17 18M9.8 14.500L7 18M8.5 10.500L4 9"/>' },
  { id: 'health', label: 'Health', svg: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7v10M7 12h10"/>' },
  { id: 'wallet', label: 'Money', svg: '<path d="M3 7h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-3v3"/><circle cx="17" cy="14" r="1.2"/>' },
  { id: 'card', label: 'Card', svg: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>' },
  { id: 'receipt', label: 'Bills', svg: '<path d="M5 3h14v18l-2.5-1.500L14 21l-2-1.500L10 21l-2.5-1.500L5 21z"/><path d="M9 8h6M9 12h6"/>' },
  { id: 'flag', label: 'Flag', svg: '<path d="M5 21V4M5 4h13l-2 4 2 4H5"/>' },
  { id: 'rocket', label: 'Project', svg: '<path d="M12 2c4 2 6 6 5 11l-3 3h-4l-3-3c-1-5 1-9 5-11z"/><circle cx="12" cy="9" r="1.8"/><path d="M8 17l-3 3M16 17l3 3M10 21h4"/>' },
  { id: 'bolt', label: 'Utilities', svg: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>' },
  { id: 'wifi', label: 'Internet', svg: '<path d="M2 9a15 15 0 0 1 20 0M5 12.500a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r=".8"/>' },
  { id: 'fuel', label: 'Fuel', svg: '<path d="M5 21V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v17M3 21h13"/><path d="M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 7h5"/>' },
  { id: 'luggage', label: 'Luggage', svg: '<rect x="6" y="7" width="12" height="13" rx="2"/><path d="M9 7V4h6v3M9 11v5M15 11v5M9 20v1.5M15 20v1.5"/>' },
  { id: 'passport', label: 'Passport', svg: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 17h6"/>' },
  { id: 'globe', label: 'Globe', svg: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>' },
  { id: 'anchor', label: 'Anchor', svg: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M7 11h10M4 14c0 4 3.5 7 8 7s8-3 8-7"/>' },
  { id: 'palm', label: 'Palm tree', svg: '<path d="M12 21c0-5 .5-8 1-10"/><path d="M13 11c-1-4-5-5-9-3 3 0 5 1 6 3M13 11c1-4 5-5 8-3-3 0-5 1-6 3M13 11c-3-2-3-6 0-8 1 3 1 5 0 8z"/>' },
  { id: 'fish', label: 'Fishing', svg: '<path d="M2 12c3-5 9-7 14-3l5-3v12l-5-3c-5 4-11 2-14-3z"/><circle cx="7" cy="11" r=".6"/>' },
  { id: 'flame', label: 'Campfire', svg: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z"/>' },
  { id: 'parking', label: 'Parking', svg: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>' },
  { id: 'wine', label: 'Wine', svg: '<path d="M7 3h10c0 5-1 9-5 9S7 8 7 3z"/><path d="M12 12v9M8 21h8M7.5 7h9"/>' },
  { id: 'beer', label: 'Beer', svg: '<path d="M5 6h11v14H5z"/><path d="M16 9h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><path d="M5 6c0-2 2-3 3-2 1-1 3-1 4 0 1-1 3 0 4 2M9 10v6M12 10v6"/>' },
  { id: 'icecream', label: 'Ice cream', svg: '<path d="M7 11a5 5 0 0 1 10 0z"/><path d="M7 11l5 11 5-11"/><path d="M9 13.5l3 6M13 13l2 3.5"/>' },
  { id: 'bowl', label: 'Meals', svg: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M9 21h6M8 3c-1 1.5 1 2.5 0 4M12 3c-1 1.5 1 2.5 0 4M16 3c-1 1.5 1 2.5 0 4"/>' },
  { id: 'basket', label: 'Groceries', svg: '<path d="M3 10h18l-2 10H5z"/><path d="M8 10l3-6M16 10l-3-6M9 14v3M12 14v3M15 14v3"/>' },
  { id: 'mic', label: 'Microphone', svg: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>' },
  { id: 'headphones', label: 'Headphones', svg: '<path d="M4 17v-5a8 8 0 0 1 16 0v5"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>' },
  { id: 'palette', label: 'Art', svg: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 0 0 3-3c0-6-3.5-11-8-11z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8" r="1"/>' },
  { id: 'pill', label: 'Medicine', svg: '<rect x="2" y="8.5" width="20" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/>' },
  { id: 'balloon', label: 'Balloons', svg: '<path d="M12 2c4 0 6 3 6 6s-2.5 7-6 8c-3.5-1-6-5-6-8s2-6 6-6z"/><path d="M12 16l-1 2h2zM12 18c0 2 2 2 2 4"/>' },
  { id: 'flower', label: 'Flowers', svg: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10 7 10 4 12 3c2 1 2 4 0 6.5zM14.5 12C17 10 20 10 21 12c-1 2-4 2-6.5 0zM12 14.5c2 2.5 2 5.5 0 6.5-2-1-2-4 0-6.5zM9.5 12C7 14 4 14 3 12c1-2 4-2 6.5 0z"/>' },
  { id: 'sprout', label: 'Plants', svg: '<path d="M12 21v-9"/><path d="M12 12c0-4-3-6-8-6 0 4 3 6 8 6zM12 14c0-3 2-5 7-5 0 4-3 5-7 5z"/>' },
  { id: 'bulb', label: 'Ideas', svg: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.800 1-2.5A6 6 0 0 0 12 3z"/>' },
  { id: 'phone', label: 'Phone', svg: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/>' },
  { id: 'tv', label: 'TV', svg: '<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8M12 18v3"/>' },
  { id: 'printer', label: 'Printing', svg: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><rect x="7" y="14" width="10" height="7"/>' },
  { id: 'scissors', label: 'Salon', svg: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8l12 10M8.5 16L20 6"/>' },
  { id: 'hammer', label: 'Building', svg: '<path d="M14 4l6 6-3 3-6-6z"/><path d="M11 7L3 15l3 3 8-8"/><path d="M13.5 15.5l-6 5.5"/>' },
  { id: 'trash', label: 'Waste', svg: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>' },
  { id: 'washer', label: 'Laundry', svg: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="14" r="5"/><path d="M7 6h2M12 6h.1"/>' },
  { id: 'bath', label: 'Bathroom', svg: '<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M6 12V6a2 2 0 0 1 4 0M7 20l-1 2M17 20l1 2"/>' },
  { id: 'shield', label: 'Insurance', svg: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>' },
  { id: 'lock', label: 'Security', svg: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2"/>' },
  { id: 'bank', label: 'Bank', svg: '<path d="M3 9l9-6 9 6zM5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18M3 18h18"/>' },
  { id: 'coins', label: 'Savings', svg: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M15 10c3 .2 6 1.3 6 3v4c0 1.7-2.7 3-6 3-1.5 0-2.800-.3-3.800-.7"/>' },
  { id: 'dollar', label: 'Cash', svg: '<circle cx="12" cy="12" r="9"/><path d="M15 9c0-1.5-1.5-2-3-2s-3 .8-3 2.2c0 3.3 6 1.600 6 4.800 0 1.400-1.5 2-3 2s-3-.6-3-2M12 5.5V7M12 17v1.5"/>' },
  { id: 'chart', label: 'Budget', svg: '<path d="M4 3v18h17"/><rect x="7" y="11" width="3" height="7"/><rect x="12" y="7" width="3" height="11"/><rect x="17" y="13" width="3" height="5"/>' },
  { id: 'calendar', label: 'Calendar', svg: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
  { id: 'clock', label: 'Clock', svg: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { id: 'trophy', label: 'Trophy', svg: '<path d="M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 15v4M8 21h8"/>' },
  { id: 'medal', label: 'Medal', svg: '<circle cx="12" cy="15" r="5"/><path d="M8 3l3 6M16 3l-3 6M9.5 15l1.5 1.5 3-3"/>' },
  { id: 'golf', label: 'Golf', svg: '<path d="M8 21V3l9 4-9 4"/><path d="M4 21h16"/><circle cx="16" cy="18" r="1.2"/>' },
  { id: 'church', label: 'Church', svg: '<path d="M12 2v5M10 4.5h4"/><path d="M12 7l6 4v10H6V11z"/><path d="M10 21v-5a2 2 0 0 1 4 0v5M2 21h20"/>' },
  { id: 'backpack', label: 'Backpack', svg: '<path d="M8 6a4 4 0 0 1 8 0"/><rect x="5" y="6" width="14" height="15" rx="4"/><path d="M9 14h6v4H9zM9 10h6"/>' },
  { id: 'crown', label: 'Crown', svg: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>' },
  { id: 'gem', label: 'Jewellery', svg: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l-2 6 5 12 5-12-2-6"/>' },
  { id: 'sparkles', label: 'Sparkle', svg: '<path d="M10 3l1.800 5.2L17 10l-5.2 1.800L10 17l-1.800-5.2L3 10l5.2-1.800z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>' },
  { id: 'smile', label: 'Fun', svg: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 2 2.5 3 4 3s3-1 4-3"/><circle cx="9" cy="9.5" r=".7"/><circle cx="15" cy="9.5" r=".7"/>' },
  { id: 'check', label: 'Checklist', svg: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>' },
  { id: 'folder', label: 'Other', svg: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>' },
]

/** 6 hue families x 5 shades, light to deep. Checked in groupLook.test.ts. */
export const COLORS = [
  '#E5484D', '#D13B40', '#BA2F35', '#A22530', '#8A1C2B', // red
  '#D9631F', '#C25416', '#AC4710', '#963C0D', '#7E320B', // orange
  '#2E9A57', '#268A4C', '#1E7A42', '#176A38', '#115A2F', // green
  '#1B8FA6', '#167F95', '#127084', '#0E6073', '#0B5062', // teal
  '#3E63DD', '#3556CC', '#2C4AB8', '#2540A8', '#1F3A98', // blue
  '#8E4EC6', '#8043B8', '#7239A8', '#653099', '#59298B', // purple
]

export const DEFAULT_COLOR = '#2B44FF'
const KIND_LOOK: Record<string, { icon: string; color: string }> = {
  Trip: { icon: 'plane', color: '#3556CC' },
  Household: { icon: 'home', color: '#1E7A42' },
  Roommates: { icon: 'users', color: '#127084' },
  Event: { icon: 'party', color: '#7E41B5' },
  'Night out': { icon: 'glass', color: '#A22530' },
  Work: { icon: 'briefcase', color: '#963C0D' },
  Itinerary: { icon: 'map', color: '#127084' },
  Checklist: { icon: 'check', color: '#1E7A42' },
}
const FALLBACK_LOOK = { icon: 'folder', color: '#3556CC' }

export interface Look { icon: string; color: string }

/** What a group looks like: its own pick if it has one, otherwise a default for its type. */
export function groupLook(g: { kind?: string | null; icon?: string | null; color?: string | null }): Look {
  const d = KIND_LOOK[g.kind || 'Trip'] ?? FALLBACK_LOOK
  const icon = g.icon && ICONS.some(i => i.id === g.icon) ? g.icon : d.icon
  const color = g.color && /^#[0-9A-Fa-f]{6}$/.test(g.color) ? g.color : d.color
  return { icon, color }
}

export const iconSvg = (id: string): string => (ICONS.find(i => i.id === id) ?? ICONS[ICONS.length - 1]).svg

/** A standalone SVG string (white icon on a coloured rounded tile), for drawing into a PDF. */
export function tileSvg(look: Look, px: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="${look.color}"/><g transform="translate(12 12)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg(look.icon)}</g></svg>`
}

/** Rasterise the tile to a PNG data URL (browser only). Returns null where canvas is not available. */
export async function tilePng(look: Look, px = 96): Promise<string | null> {
  try {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return null
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tileSvg(look, px))
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('icon')); img.src = url })
    const c = document.createElement('canvas'); c.width = px; c.height = px
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, px, px)
    return c.toDataURL('image/png')
  } catch { return null }
}

export const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
/** Excel wants ARGB with no #. */
export const hexArgb = (hex: string): string => 'FF' + hex.slice(1).toUpperCase()

/** WCAG relative luminance and contrast ratio. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: string, b: string): number => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
