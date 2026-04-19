import type { Quote } from '../types';

export const QUOTES: Quote[] = [
  { text: 'The details are not the details. They make the design.', by: 'Charles Eames' },
  { text: 'Simplicity is the ultimate sophistication.', by: 'Leonardo da Vinci' },
  { text: 'Make it work, make it right, make it fast.', by: 'Kent Beck' },
  { text: "Perfection is achieved when there is nothing left to take away.", by: 'Antoine de Saint-Exupéry' },
  { text: 'Any sufficiently advanced technology is indistinguishable from magic.', by: 'Arthur C. Clarke' },
  { text: 'Form follows function.', by: 'Louis Sullivan' },
  { text: 'Less, but better.', by: 'Dieter Rams' },
];

export function quoteForToday(): Quote {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return QUOTES[seed % QUOTES.length]!;
}
