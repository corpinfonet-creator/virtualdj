import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaManager } from "@/components/pwa-manager";

export const metadata: Metadata = { title: "AutoDJ AI", description: "Continuous intelligent music operations", applicationName:"AutoDJ AI", appleWebApp:{capable:true,statusBarStyle:"black-translucent",title:"AutoDJ"} };
export const viewport:Viewport={themeColor:"#070a0f",colorScheme:"dark"};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}<PwaManager/></body></html>;
}
