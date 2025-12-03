'use client';

interface PriceLabelProps {
  price: number;
  currency: string;
  quantity?: number;
}

export function PriceLabel({ price, currency, quantity = 1 }: PriceLabelProps) {
  const formatPrice = (amount: number, curr: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
    }).format(amount);
  };

  if (price === 0) {
    return <span className="font-bold text-emerald-400">Free!</span>;
  }

  return (
    <span className="font-bold text-white">
      {formatPrice(price * quantity, currency)}
    </span>
  );
}

