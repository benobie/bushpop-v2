"use client";

import { FLAT_RATE_SHIPPING_CENTS } from "@bushpop/config";

type ShippingClass = "xs" | "s" | "m" | "l" | "xl";

const SHIPPING_CLASS_LABELS: Record<ShippingClass, { label: string; description: string }> = {
  xs: { label: "XS — Letter / Small envelope", description: "Accessories, jewellery, small items" },
  s: { label: "S — Small satchel", description: "T-shirts, belts, lightweight tops" },
  m: { label: "M — Medium satchel", description: "Jeans, dresses, knitwear" },
  l: { label: "L — Large satchel", description: "Jackets, coats, bulky knitwear" },
  xl: { label: "XL — Extra large", description: "Boots, bags, oversized items" },
};

interface ShippingClassPickerProps {
  value: ShippingClass | null;
  onChange: (cls: ShippingClass) => void;
}

function centsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ShippingClassPicker({ value, onChange }: ShippingClassPickerProps) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold text-brand-800">Shipping class</legend>
      <div className="space-y-2">
        {(Object.keys(SHIPPING_CLASS_LABELS) as ShippingClass[]).map((cls) => {
          const { label, description } = SHIPPING_CLASS_LABELS[cls];
          const cost = centsToDollars(FLAT_RATE_SHIPPING_CENTS[cls] ?? 0);
          const isSelected = value === cls;

          return (
            <label
              key={cls}
              className={[
                "flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors",
                isSelected
                  ? "border-brand-600 bg-brand-50"
                  : "border-brand-200 hover:border-brand-400",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="shippingClass"
                  value={cls}
                  checked={isSelected}
                  onChange={() => onChange(cls)}
                  className="accent-brand-700"
                />
                <div>
                  <p className="text-sm font-medium text-brand-800">{label}</p>
                  <p className="text-xs text-brand-500">{description}</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-brand-700">{cost}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
