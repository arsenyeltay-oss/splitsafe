import type { Metadata } from "next";
import { CheckoutDemo } from "@/components/checkout-demo";

export const metadata: Metadata = { title: "Checkout demo — SplitSafe" };

export default function CheckoutDemoPage() {
  return <CheckoutDemo />;
}
