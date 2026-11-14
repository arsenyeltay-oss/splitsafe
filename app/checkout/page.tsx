import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout-page";

export const metadata: Metadata = { title: "Checkout — SplitSafe Plus" };

export default function Checkout() {
  return <CheckoutPage />;
}
