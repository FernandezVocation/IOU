import type { CSSProperties } from 'react'

export interface CategoryDef { name: string; hue: number; subs: string[] }

/** Suggested categories with their sub-categories. Anything else a person types is a custom one. */
export const CATEGORIES: CategoryDef[] = [
  { name: 'Food', hue: 15, subs: ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Dessert', 'Takeout', 'Street food'] },
  { name: 'Drinks', hue: 320, subs: ['Coffee & tea', 'Cocktails', 'Beer', 'Wine', 'Bar tab', 'Soft drinks'] },
  { name: 'Grocery', hue: 105, subs: ['Groceries', 'Market', 'Household', 'Alcohol store'] },
  { name: 'Transportation', hue: 225, subs: ['Flights', 'Train', 'Bus', 'Transit', 'Taxi', 'Car rental', 'Gas', 'Parking', 'Boat'] },
  { name: 'Housing', hue: 170, subs: ['Hotel', 'Rental / Airbnb', 'Hostel', 'Rent', 'Utilities', 'Cleaning fee', 'Deposit'] },
  { name: 'Attractions', hue: 255, subs: ['Museum', 'Landmark', 'Guided tour', 'Tickets', 'Park', 'Viewpoint'] },
  { name: 'Activities', hue: 200, subs: ['Tour', 'Outdoor', 'Spa', 'Sports', 'Class', 'Gear rental', 'Gondola ride'] },
  { name: 'Entertainment', hue: 285, subs: ['Movie', 'Musical', 'Concert', 'Theatre', 'Nightlife', 'Sports event'] },
  { name: 'Shopping', hue: 75, subs: ['Clothing', 'Electronics', 'Toiletries', 'Luggage', 'Duty-free'] },
  { name: 'Souvenirs', hue: 140, subs: ['Gifts', 'Clothing', 'Crafts', 'Postcards & magnets'] },
  { name: 'Fees', hue: 45, subs: ['Booking fee', 'Tourist tax', 'Currency / ATM', 'Service charge', 'Tip', 'Baggage'] },
  { name: 'Fines', hue: 350, subs: ['Parking ticket', 'Traffic', 'Transit fine', 'Late fee'] },
]

/** Suggested group types. A group can also have any type its creator types in. */
export const GROUP_KINDS = ['Trip', 'Household', 'Roommates', 'Event', 'Night out', 'Work']

export const catDef = (name: string): CategoryDef | undefined => CATEGORIES.find(c => c.name === name)

export const NO_CATEGORY = 'Uncategorized'

/** "Food › Dinner", "Food", or "Uncategorized". */
export const catLabel = (e: { category: string; subcategory?: string }): string =>
  e.category ? (e.subcategory ? `${e.category} › ${e.subcategory}` : e.category) : NO_CATEGORY

/** Colour for a category swatch: its own hue, or neutral grey for custom and uncategorized. */
export const catStyle = (name: string): CSSProperties => {
  const d = catDef(name)
  return (d ? { '--h': d.hue } : { '--h': 0, '--cs': '0%' }) as unknown as CSSProperties
}
