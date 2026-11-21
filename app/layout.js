import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./workbench-ui.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata = {
  title: "GRA Agent Workbench",
  description: "Created by Gaurav Sharma | AI & Automation",
};

export const viewport = {
  themeColor: "#F6F8FC",
  colorScheme: "light",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} bg-app`}
    >
      <body>{children}</body>
    </html>
  );
}
