import type { ReactNode } from "react";
import { Assistant } from "next/font/google";

const assistant = Assistant({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className={`${assistant.className} h-full`}>{children}</div>;
}
